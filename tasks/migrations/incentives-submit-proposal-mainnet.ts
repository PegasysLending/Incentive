import { formatEther } from 'ethers/lib/utils';
import { task } from 'hardhat/config';
import { DRE, impersonateAccountsHardhat, latestBlock } from '../../helpers/misc-utils';
import { IERC20__factory, IGovernancePowerDelegationToken__factory } from '../../types';
import { IAaveGovernanceV2 } from '../../types/IAaveGovernanceV2';
import { getDefenderRelaySigner } from '../../helpers/defender-utils';
import isIPFS from 'is-ipfs';
import { Signer } from '@ethersproject/abstract-signer';

const {
  AAVE_TOKEN = '0x9C716BA14d87c53041bB7fF95C977d5a382E71F7',
  AAVE_GOVERNANCE_V2 = '0x3515F2b1Cc5E13a0A8AE89BF5B313D442B36aA66', // mainnet
  AAVE_SHORT_EXECUTOR = '0x3162c8729602EF828C3608459bF178FaA93B0d0e', // mainnet
} = process.env;

task('incentives-submit-proposal:mainnet', 'Submit the incentives proposal to Aave Governance')
  .addParam('proposalExecutionPayload')
  .addParam('aTokens')
  .addParam('variableDebtTokens')
  .addFlag('defender')
  .setAction(
    async ({ defender, proposalExecutionPayload, aTokens, variableDebtTokens }, localBRE) => {
      await localBRE.run('set-DRE');
      let proposer: Signer;
      [proposer] = await DRE.ethers.getSigners();

      if (defender) {
        const { signer } = await getDefenderRelaySigner();
        proposer = signer;
      }

      if (!AAVE_TOKEN || !AAVE_GOVERNANCE_V2 || !AAVE_SHORT_EXECUTOR) {
        throw new Error(
          'You have not set correctly the .env file, make sure to read the README.md'
        );
      }

      if (aTokens.split(',').length !== 3) {
        throw new Error('aTokens input param should have 3 elements');
      }

      if (variableDebtTokens.split(',').length !== 3) {
        throw new Error('variable debt token param should have 3 elements');
      }

      const proposerAddress = await proposer.getAddress();

      // Initialize contracts and tokens
      const gov = (await DRE.ethers.getContractAt(
        'IAaveGovernanceV2',
        AAVE_GOVERNANCE_V2,
        proposer
      )) as IAaveGovernanceV2;

      const aave = IERC20__factory.connect(AAVE_TOKEN, proposer);

      // Balance and proposal power check
      const balance = await aave.balanceOf(proposerAddress);
      const priorBlock = ((await latestBlock()) - 1).toString();
      const aaveGovToken = IGovernancePowerDelegationToken__factory.connect(AAVE_TOKEN, proposer);
      const propositionPower = await aaveGovToken.getPowerAtBlock(proposerAddress, priorBlock, '1');

      console.log('- AAVE Balance proposer', formatEther(balance));
      console.log(
        `- Proposition power of ${proposerAddress} at block: ${priorBlock}`,
        formatEther(propositionPower)
      );

      // Submit proposal
      const proposalId = await gov.getProposalsCount();
      const proposalParams = {
        proposalExecutionPayload,
        aTokens,
        variableDebtTokens,
        aaveGovernance: AAVE_GOVERNANCE_V2,
        shortExecutor: AAVE_SHORT_EXECUTOR,
        defender: true,
      };
      console.log('- Submitting proposal with following params:');
      console.log(JSON.stringify(proposalParams, null, 2));

      await DRE.run('propose-incentives', proposalParams);
      console.log('- Proposal Submited:', proposalId.toString());
    }
  );
