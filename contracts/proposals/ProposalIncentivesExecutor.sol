// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import {IERC20} from '@aave/aave-stake/contracts/interfaces/IERC20.sol';
import {ILendingPoolAddressesProvider} from '../interfaces/ILendingPoolAddressesProvider.sol';
import {ILendingPoolConfigurator} from '../interfaces/ILendingPoolConfigurator.sol';
import {IPegasysIncentivesController} from '../interfaces/IPegasysIncentivesController.sol';
import {IPegasysEcosystemReserveController} from '../interfaces/IPegasysEcosystemReserveController.sol';
import {IProposalIncentivesExecutor} from '../interfaces/IProposalIncentivesExecutor.sol';
import {DistributionTypes} from '../lib/DistributionTypes.sol';
import {DataTypes} from '../utils/DataTypes.sol';
import {ILendingPoolData} from '../interfaces/ILendingPoolData.sol';
import {IATokenDetailed} from '../interfaces/IATokenDetailed.sol';
import {PercentageMath} from '../utils/PercentageMath.sol';
import {SafeMath} from '../lib/SafeMath.sol';

contract ProposalIncentivesExecutor is IProposalIncentivesExecutor {
  using SafeMath for uint256;
  using PercentageMath for uint256;

  address constant Pegasys_TOKEN = 0x9C716BA14d87c53041bB7fF95C977d5a382E71F7;
  address constant POOL_CONFIGURATOR = 0x5Dda19AC38b19788A7842819d6673034006090E1;
  address constant ADDRESSES_PROVIDER = 0x17F701D30487b0D718772449f3468C05Be61258f;
  address constant LENDING_POOL = 0x779c46e29fE0C081cb0b90AC4e3b5D06153A9B62;
  address constant ECO_RESERVE_ADDRESS = 0x5Dda19AC38b19788A7842819d6673034006090E1;
  address constant INCENTIVES_CONTROLLER_PROXY_ADDRESS = 0x7900fE24B4d10007D3295301FE9E87345BCcA509;
  address constant INCENTIVES_CONTROLLER_IMPL_ADDRESS = 0xdfd288C40119584FB45F7053Cb384c885A6832a5;

  uint256 constant DISTRIBUTION_DURATION = 7776000; // 90 days
  // uint256 constant DISTRIBUTION_AMOUNT = 198000000000000000000000; // 198000 Pegasys during 90 days
  uint256 constant DISTRIBUTION_AMOUNT = 10*(10**18); // 10TTC4 testToken during 90 days
  
  function execute(
    address[3] memory aTokenImplementations,
    address[3] memory variableDebtImplementations
  ) external override {
    uint256 tokensCounter;

    address[] memory assets = new address[](6);

    // Reserves Order: WETH/USDT/WBTC
    address payable[3] memory reserves =
      [
        0xcAc0759160d57A33D332Ed36a555C10957694407,
        0x9D973BAc12BB62A55be0F9f7Ad201eEA4f9B8428,
        0xfA600253bB6fE44CEAb0538000a8448807e50c85
      ];

    uint256[] memory emissions = new uint256[](6);

    emissions[0] = 1706018518518520; //aWETH
    emissions[1] = 1706018518518520; //vDebtWETH
    emissions[2] = 92939814814815; //aUSDT
    emissions[3] = 92939814814815; //vDebtUSDT
    emissions[4] = 5291203703703700; //aWBTC
    emissions[5] = 5291203703703700; //vDebtWBTC

    ILendingPoolConfigurator poolConfigurator = ILendingPoolConfigurator(POOL_CONFIGURATOR);
    IPegasysIncentivesController incentivesController =
      IPegasysIncentivesController(INCENTIVES_CONTROLLER_PROXY_ADDRESS);
    IPegasysEcosystemReserveController ecosystemReserveController =
      IPegasysEcosystemReserveController(ECO_RESERVE_ADDRESS);

    ILendingPoolAddressesProvider provider = ILendingPoolAddressesProvider(ADDRESSES_PROVIDER);

    //adding the incentives controller proxy to the addresses provider
    provider.setAddress(keccak256('INCENTIVES_CONTROLLER'), INCENTIVES_CONTROLLER_PROXY_ADDRESS);

    //updating the implementation of the incentives controller proxy
    provider.setAddressAsProxy(keccak256('INCENTIVES_CONTROLLER'), INCENTIVES_CONTROLLER_IMPL_ADDRESS);

    require(
      aTokenImplementations.length == variableDebtImplementations.length &&
        aTokenImplementations.length == reserves.length,
      'ARRAY_LENGTH_MISMATCH'
    );

    // Update each reserve AToken implementation, Debt implementation, and prepare incentives configuration input
    for (uint256 x = 0; x < reserves.length; x++) {
      require(
        IATokenDetailed(aTokenImplementations[x]).UNDERLYING_ASSET_ADDRESS() == reserves[x],
        'AToken underlying does not match'
      );
      require(
        IATokenDetailed(variableDebtImplementations[x]).UNDERLYING_ASSET_ADDRESS() == reserves[x],
        'Debt Token underlying does not match'
      );
      DataTypes.ReserveData memory reserveData =
        ILendingPoolData(LENDING_POOL).getReserveData(reserves[x]);

      // Update aToken impl
      poolConfigurator.updateAToken(reserves[x], aTokenImplementations[x]);

      // Update variable debt impl
      poolConfigurator.updateVariableDebtToken(reserves[x], variableDebtImplementations[x]);

      assets[tokensCounter++] = reserveData.aTokenAddress;

      // Configure variable debt token at incentives controller
      assets[tokensCounter++] = reserveData.variableDebtTokenAddress;

    }
    // Transfer Pegasys funds to the Incentives Controller
    ecosystemReserveController.transfer(
      Pegasys_TOKEN,
      INCENTIVES_CONTROLLER_PROXY_ADDRESS,
      DISTRIBUTION_AMOUNT
    );

    // Enable incentives in aTokens and Variable Debt tokens
    incentivesController.configureAssets(assets, emissions);

    // Sets the end date for the distribution
    incentivesController.setDistributionEnd(block.timestamp + DISTRIBUTION_DURATION);
  }
}
