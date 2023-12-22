import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { eContractid } from "../../helpers/types";
import { BaseIncentivesController, DistributionManager, PullRewardsIncentivesController } from "../../types";

task(`active-incentives`, `Make incentives active`)
  .setAction(async( {}, BRE: HardhatRuntimeEnvironment) => {
    await BRE.run('set-DRE');
    
    // Impl address
    const incentivesAddress = '0xc6AA3eD49053567b3eE7fcD4206324974ED0bD89';
    const distributionSeconds = 7776000 // 90 days
    // aTokenAddress and variableDebtTokenAddress is deployed by Lending-Contracts project, stored in deployed-contracts.json.
    // the total emissions[0] for aTokenAddress per seconds
    //           emissions[1] for variableDebtTokenAddress per seconds
    const tokenPairs = [
      {
        // WSYS: '0x65b28cBda2E2Ff082131549C1198DC9a50328186',
        aTokenAddress: '0xed79570e50f4f46aa183c2367bD3C2017872DcC5',
        variableDebtTokenAddress: '0x0ebf07118530bdc161cDb1b280F112480A87fAff',
        emissions:[1706018518518520,1706018518518520],
      },
      {
        // WBTC: '0x386aFa4cED76F3Ddd5D086599030fC21B7Ad9c10',
        aTokenAddress: '0x8b08cF476e50FfAa393AA60A52ea642235bf689F',
        variableDebtTokenAddress: '0x84c4EC1D3cA47CC416f72321C397F836a5AF4350',
        emissions: [92939814814815,92939814814815],
      },
      {
        // WETH: '0xFE0e902E5F363029870BDc871D27b0C9C46c8b80',
        aTokenAddress: '0xaa7946882EA748D3D6BaB1d7443a69C4D2c95E56',
        variableDebtTokenAddress: '0x8ee9241b4d9B069fABbbf5e2284FCdA16ca25CaD',
        emissions: [5291203703703700,5291203703703700],
      },
      {
        // USDT: '0xd270B0EdA02c6fEF5E213Bc99D4255B9eDd22617',
        aTokenAddress: '0x41Fa181f8055e7407e8E3f6f28BC0CdDC134570D',
        variableDebtTokenAddress: '0x6ff0b570804D0e1dfbaC08D2F13A94FD7a4Fc4dB',
        emissions:[1706018518518520,1706018518518520],
      }
    ]

    

    const assets: string[] = [];
    const emissions: number[] = [];
    let tokenCounters = 0;
    for(let i = 0; i < tokenPairs.length; i++) {
      assets[tokenCounters++] = tokenPairs[i].aTokenAddress
      assets[tokenCounters++] = tokenPairs[i].variableDebtTokenAddress
      emissions[i*2] = tokenPairs[i].emissions[0]
      emissions[i*2+1] = tokenPairs[i].emissions[1]
    }
    
    const incentivesController = (await BRE.ethers.getContractAt(eContractid.PullRewardsIncentivesController, incentivesAddress)) as PullRewardsIncentivesController;
    await incentivesController.configureAssets(assets,emissions);

    const distributionEnd = parseInt((new Date().getTime() / 1000).toFixed(0)) + distributionSeconds; 
    console.log('Distribution end in '+distributionEnd.toFixed()+'(90days)');
    await incentivesController.setDistributionEnd(distributionEnd)

  })