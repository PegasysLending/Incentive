import { task } from 'hardhat/config';
import { DRE } from '../../helpers/misc-utils';
import { tEthereumAddress } from '../../helpers/types';
import { getReserveConfigs } from '../../test-fork/helpers';
import { ProposalIncentivesExecutor__factory, IERC20Detailed__factory } from '../../types';
import { ILendingPool } from '../../types/ILendingPool';
import { getDefenderRelaySigner } from '../../helpers/defender-utils';
import { Signer } from 'ethers';
import kebabCase from 'kebab-case';

const {
  RESERVES = 'USDT,WBTC,WETH',//USDC,
  POOL_PROVIDER = '0x48AeF6944B1Bd3D840414e889797874CA3eA2468',
  POOL_DATA_PROVIDER = '0xb02d5A64A05D46dC2c9eE85DbC92463B4AFa5c80',
  PEGASYS_TOKEN = '0x9C716BA14d87c53041bB7fF95C977d5a382E71F7',
  TREASURY = '0x5Dda19AC38b19788A7842819d6673034006090E1',// TODO Unknown
  PEGASYS_GOVERNANCE_V2 = '0x3515F2b1Cc5E13a0A8AE89BF5B313D442B36aA66', // mainnet TODO Unknown
  PEGASYS_SHORT_EXECUTOR = '0x3162c8729602EF828C3608459bF178FaA93B0d0e', // mainnet
} = process.env;

const PEGASYS_LENDING_POOL = '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9';
const INCENTIVES_PROXY = '0xE70548eF84c856993e5811918f13C759cfF6176F';

task(
  'incentives-deploy:mainnet',
  'Deploy the payload contract, atokens and variable debt token implementations. Print the params for submitting proposal'
)
  .addFlag('defender')
  .setAction(async ({ defender }, localBRE) => {
    let aTokensImpl: tEthereumAddress[];
    let variableDebtTokensImpl: tEthereumAddress[];
    let proposalExecutionPayload: tEthereumAddress;
    let symbols: {
      [key: string]: {
        aToken: { symbol: string; name: string };
        variableDebtToken: { symbol: string; name: string };
      };
    } = {};

    await localBRE.run('set-DRE');

    let deployer: Signer;
    [deployer] = await DRE.ethers.getSigners();

    if (defender) {
      const { signer } = await getDefenderRelaySigner();
      deployer = signer;
    }

    const ethers = DRE.ethers;

    const incentivesProxy = INCENTIVES_PROXY;

    if (
      !RESERVES ||
      !POOL_DATA_PROVIDER ||
      !PEGASYS_TOKEN ||
      !PEGASYS_GOVERNANCE_V2 ||
      !PEGASYS_SHORT_EXECUTOR ||
      !TREASURY
    ) {
      throw new Error('You have not set correctly the .env file, make sure to read the README.md');
    }

    console.log('- Deploying aTokens and Variable Debt Tokens implementations');

    // Deploy aTokens and debt tokens
    const { aTokens, variableDebtTokens } = await DRE.run('deploy-reserve-implementations', {
      provider: POOL_PROVIDER,
      assets: RESERVES,
      incentivesController: incentivesProxy,
      treasury: TREASURY,
      defender: true,
    });

    aTokensImpl = [...aTokens];
    variableDebtTokensImpl = [...variableDebtTokens];

    // Deploy Proposal Executor Payload
    const {
      address: proposalExecutionPayloadAddress,
    } = await new ProposalIncentivesExecutor__factory(deployer).deploy();
    proposalExecutionPayload = proposalExecutionPayloadAddress;

    console.log('Deployed ProposalIncentivesExecutor at:', proposalExecutionPayloadAddress);

    console.log('- Finished deployment script');

    console.log('=== INFO ===');
    console.log('Proposal payload:', proposalExecutionPayloadAddress);
    console.log('Incentives Controller proxy:', incentivesProxy);
    console.log(
      'Needed params to submit the proposal at the following task: ',
      '$ npx hardhat --network main incentives-submit-proposal:mainnet'
    );
    const proposalParams = {
      proposalExecutionPayload,
      aTokens: aTokensImpl.join(','),
      variableDebtTokens: variableDebtTokensImpl.join(','),
    };
    console.log(
      `--defender `,
      Object.keys(proposalParams)
        .map((str) => `--${kebabCase(str)} ${proposalParams[str]}`)
        .join(' ')
    );

    await DRE.run('verify-proposal-etherscan', {
      assets: RESERVES,
      aTokens: aTokensImpl.join(','),
      variableDebtTokens: variableDebtTokensImpl.join(','),
      proposalPayloadAddress: proposalExecutionPayloadAddress,
    });
  });
