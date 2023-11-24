// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import {IERC20} from '@aave/aave-stake/contracts/interfaces/IERC20.sol';
import {ILendingPoolAddressesProvider} from '../interfaces/ILendingPoolAddressesProvider.sol';
import {ILendingPoolConfigurator} from '../interfaces/ILendingPoolConfigurator.sol';
import {IAaveIncentivesController} from '../interfaces/IAaveIncentivesController.sol';
import {IAaveEcosystemReserveController} from '../interfaces/IAaveEcosystemReserveController.sol';
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

  address constant AAVE_TOKEN = 0x9C716BA14d87c53041bB7fF95C977d5a382E71F7;
  address constant POOL_CONFIGURATOR = 0x6f1a70E999b575d8B6D789088303aCCBE4ee32D2;//LendingPoolConfigurator
  address constant ADDRESSES_PROVIDER = 0x6162Ef9eB244631446E190C9E68e744D413544f8;//LendingPoolAddressesProvider
  address constant LENDING_POOL = 0x5a068E7AdD1b102CFC88AB7b539F9109D05B410E;//LendingPool
  address constant ECO_RESERVE_ADDRESS = 0x5Dda19AC38b19788A7842819d6673034006090E1;//TODO
  address constant INCENTIVES_CONTROLLER_PROXY_ADDRESS = 0xF7ecfD1D712CF8A487d867D4dE20C09804cD3793;
  address constant INCENTIVES_CONTROLLER_IMPL_ADDRESS = 0x52E67eC443f9223647dE4618C13e2d84B3e826E8;

  uint256 constant DISTRIBUTION_DURATION = 7776000; // 90 days
  // uint256 constant DISTRIBUTION_AMOUNT = 198000000000000000000000; // 198000 AAVE during 90 days
  uint256 constant DISTRIBUTION_AMOUNT = 20*(10**18); // 10TTC4 testToken during 90 days
  
  function execute(
    address[4] memory aTokenImplementations,
    address[4] memory variableDebtImplementations
  ) external override {
    uint256 tokensCounter;

    address[] memory assets = new address[](8);

    // Reserves Order: WETH/USDT/WBTC
    address payable[4] memory reserves =
      [
        0x65b28cBda2E2Ff082131549C1198DC9a50328186,
        0xFE0e902E5F363029870BDc871D27b0C9C46c8b80,
        0xd270B0EdA02c6fEF5E213Bc99D4255B9eDd22617,
        0x386aFa4cED76F3Ddd5D086599030fC21B7Ad9c10
      ];

    uint256[] memory emissions = new uint256[](8);

    emissions[0] = 1706018518518520; //aWSYS
    emissions[1] = 1706018518518520; //vDebtWSYS
    emissions[2] = 1706018518518520; //aWETH
    emissions[3] = 1706018518518520; //vDebtWETH
    emissions[4] = 92939814814815; //aUSDT
    emissions[5] = 92939814814815; //vDebtUSDT
    emissions[6] = 5291203703703700; //aWBTC
    emissions[7] = 5291203703703700; //vDebtWBTC

    ILendingPoolConfigurator poolConfigurator = ILendingPoolConfigurator(POOL_CONFIGURATOR);
    IAaveIncentivesController incentivesController = IAaveIncentivesController(INCENTIVES_CONTROLLER_PROXY_ADDRESS);
    IAaveEcosystemReserveController ecosystemReserveController = IAaveEcosystemReserveController(ECO_RESERVE_ADDRESS);

    ILendingPoolAddressesProvider provider = ILendingPoolAddressesProvider(ADDRESSES_PROVIDER);

    //adding the incentives controller proxy to the addresses provider

    // (bool success, ) = ADDRESSES_PROVIDER.delegatecall(
    //   abi.encodeWithSignature("setAddress(bytes32,address)",keccak256('INCENTIVES_CONTROLLER'), INCENTIVES_CONTROLLER_PROXY_ADDRESS)
    // );
    // require(success, "setAddress(bytes32,address) fail");
    
    
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
    // Transfer AAVE funds to the Incentives Controller
    ecosystemReserveController.transfer(
      AAVE_TOKEN,
      INCENTIVES_CONTROLLER_PROXY_ADDRESS,
      DISTRIBUTION_AMOUNT
    );

    // Enable incentives in aTokens and Variable Debt tokens
    incentivesController.configureAssets(assets, emissions);

    // Sets the end date for the distribution
    incentivesController.setDistributionEnd(block.timestamp + DISTRIBUTION_DURATION);
  }
}
