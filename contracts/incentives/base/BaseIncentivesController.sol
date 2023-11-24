// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import {SafeMath} from '../../lib/SafeMath.sol';
import {DistributionTypes} from '../../lib/DistributionTypes.sol';
import {VersionedInitializable} from '@aave/aave-stake/contracts/utils/VersionedInitializable.sol';
import {DistributionManager} from './DistributionManager.sol';
import {IERC20} from '@aave/aave-stake/contracts/interfaces/IERC20.sol';
import {IScaledBalanceToken} from '../../interfaces/IScaledBalanceToken.sol';
import {IAaveIncentivesController} from '../../interfaces/IAaveIncentivesController.sol';

/**
 * @title BaseIncentivesController
 * @notice Abstract contract template to build Distributors contracts for ERC20 rewards to protocol participants
 * @author Aave
 **/
abstract contract BaseIncentivesController is
  IAaveIncentivesController,
  VersionedInitializable,
  DistributionManager
{
  using SafeMath for uint256;

  uint256 public constant REVISION = 1;

  address public immutable override REWARD_TOKEN;

  mapping(address => uint256) internal _usersUnclaimedRewards;

  // this mapping allows whitelisted addresses to claim on behalf of others
  // useful for contracts that hold tokens to be rewarded but don't have any native logic to claim Liquidity Mining rewards
  mapping(address => address) internal _authorizedClaimers;

  modifier onlyAuthorizedClaimers(address claimer, address user) {
    require(_authorizedClaimers[user] == claimer, 'CLAIMER_UNAUTHORIZED');
    _;
  }

  constructor(IERC20 rewardToken, address emissionManager)
    DistributionManager(emissionManager)
  {
    REWARD_TOKEN = address(rewardToken);
  }

  /// @inheritdoc IAaveIncentivesController
  function configureAssets(address[] calldata assets, uint256[] calldata emissionsPerSecond)
    external
    override
    onlyEmissionManager
  {
    require(assets.length == emissionsPerSecond.length, 'INVALID_CONFIGURATION');

    DistributionTypes.AssetConfigInput[] memory assetsConfig =
      new DistributionTypes.AssetConfigInput[](assets.length);

    for (uint256 i = 0; i < assets.length; i++) {
      require(uint104(emissionsPerSecond[i]) == emissionsPerSecond[i], 'Index overflow at emissionsPerSecond');
      assetsConfig[i].underlyingAsset = assets[i];
      assetsConfig[i].emissionPerSecond = uint104(emissionsPerSecond[i]);
      assetsConfig[i].totalStaked = IScaledBalanceToken(assets[i]).scaledTotalSupply();
    }
    _configureAssets(assetsConfig);
  }

  
  event IncentivesController_1(address indexed user, uint256 indexed totalSupply, uint256 indexed userBalance, address sender);//TODO
  event IncentivesController_2(uint256 indexed accruedRewards);//TODO
  event IncentivesController_3(address indexed sender, uint256 indexed message);//TODO

  /// @inheritdoc IAaveIncentivesController
  function handleAction(
    address user,
    uint256 totalSupply,
    uint256 userBalance
  ) external override {
    emit IncentivesController_1(user,totalSupply,userBalance,msg.sender);//TODO 7ad7e16467fc911b05ff29
    uint256 accruedRewards = _updateUserAssetInternal(user, msg.sender, userBalance, totalSupply);
    emit IncentivesController_2(accruedRewards);//TODO 3fffc5dc477a61b9236de70be19
    if (accruedRewards != 0) {
      _usersUnclaimedRewards[user] = _usersUnclaimedRewards[user].add(accruedRewards);
      emit RewardsAccrued(user, accruedRewards);
    }
    emit IncentivesController_3(user,totalSupply);//TODO 8af3cc0a984d38e6e536
  }

  /// @inheritdoc IAaveIncentivesController
  function getRewardsBalance(address[] calldata assets, address user)
    external
    view
    override
    returns (uint256)
  {
    uint256 unclaimedRewards = _usersUnclaimedRewards[user];

    DistributionTypes.UserStakeInput[] memory userState =
      new DistributionTypes.UserStakeInput[](assets.length);
    for (uint256 i = 0; i < assets.length; i++) {
      userState[i].underlyingAsset = assets[i];
      (userState[i].stakedByUser, userState[i].totalStaked) = IScaledBalanceToken(assets[i])
        .getScaledUserBalanceAndSupply(user);
    }
    unclaimedRewards = unclaimedRewards.add(_getUnclaimedRewards(user, userState));
    return unclaimedRewards;
  }

  /// @inheritdoc IAaveIncentivesController
  function claimRewards(
    address[] calldata assets,
    uint256 amount,
    address to
  ) external override returns (uint256) {
    require(to != address(0), 'INVALID_TO_ADDRESS');
    return _claimRewards(assets, amount, msg.sender, msg.sender, to);
  }

  /// @inheritdoc IAaveIncentivesController
  function claimRewardsOnBehalf(
    address[] calldata assets,
    uint256 amount,
    address user,
    address to
  ) external override onlyAuthorizedClaimers(msg.sender, user) returns (uint256) {
    require(user != address(0), 'INVALID_USER_ADDRESS');
    require(to != address(0), 'INVALID_TO_ADDRESS');
    return _claimRewards(assets, amount, msg.sender, user, to);
  }

  /// @inheritdoc IAaveIncentivesController
  function claimRewardsToSelf(address[] calldata assets, uint256 amount)
    external
    override
    returns (uint256)
  {
    return _claimRewards(assets, amount, msg.sender, msg.sender, msg.sender);
  }

  /// @inheritdoc IAaveIncentivesController
  function setClaimer(address user, address caller) external override onlyEmissionManager {
    _authorizedClaimers[user] = caller;
    emit ClaimerSet(user, caller);
  }

  /// @inheritdoc IAaveIncentivesController
  function getClaimer(address user) external view override returns (address) {
    return _authorizedClaimers[user];
  }

  /// @inheritdoc IAaveIncentivesController
  function getUserUnclaimedRewards(address _user) external view override returns (uint256) {
    return _usersUnclaimedRewards[_user];
  }

  /**
   * @dev returns the revision of the implementation contract
   */
  function getRevision() internal pure override returns (uint256) {
    return REVISION;
  }

  /**
   * @dev Claims reward for an user on behalf, on all the assets of the lending pool, accumulating the pending rewards.
   * @param amount Amount of rewards to claim
   * @param user Address to check and claim rewards
   * @param to Address that will be receiving the rewards
   * @return Rewards claimed
   **/
  function _claimRewards(
    address[] calldata assets,
    uint256 amount,
    address claimer,
    address user,
    address to
  ) internal returns (uint256) {
    if (amount == 0) {
      return 0;
    }
    uint256 unclaimedRewards = _usersUnclaimedRewards[user];

    if (amount > unclaimedRewards) {
      DistributionTypes.UserStakeInput[] memory userState =
        new DistributionTypes.UserStakeInput[](assets.length);
      for (uint256 i = 0; i < assets.length; i++) {
        userState[i].underlyingAsset = assets[i];
        (userState[i].stakedByUser, userState[i].totalStaked) = IScaledBalanceToken(assets[i])
          .getScaledUserBalanceAndSupply(user);
      }

      uint256 accruedRewards = _claimRewards(user, userState);
      if (accruedRewards != 0) {
        unclaimedRewards = unclaimedRewards.add(accruedRewards);
        emit RewardsAccrued(user, accruedRewards);
      }
    }

    if (unclaimedRewards == 0) {
      return 0;
    }

    uint256 amountToClaim = amount > unclaimedRewards ? unclaimedRewards : amount;
    _usersUnclaimedRewards[user] = unclaimedRewards - amountToClaim; // Safe due to the previous line

    _transferRewards(to, amountToClaim);
    emit RewardsClaimed(user, to, claimer, amountToClaim);

    return amountToClaim;
  }

  /**
   * @dev Abstract function to transfer rewards to the desired account
   * @param to Account address to send the rewards
   * @param amount Amount of rewards to transfer
   */
  function _transferRewards(address to, uint256 amount) internal virtual;
}
