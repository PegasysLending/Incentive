import { formatEther, parseEther } from 'ethers/lib/utils';
import { task } from 'hardhat/config';
import { advanceBlockTo, DRE, increaseTime, latestBlock } from '../../helpers/misc-utils';
import { IERC20__factory, IGovernancePowerDelegationToken__factory } from '../../types';
import { IAaveGovernanceV2 } from '../../types/IAaveGovernanceV2';
import { getDefenderRelaySigner } from '../../helpers/defender-utils';
import isIPFS from 'is-ipfs';
import { Signer } from '@ethersproject/abstract-signer';
import { logError } from '../../helpers/tenderly-utils';

const {
  PEGASYS_TOKEN = '0x9C716BA14d87c53041bB7fF95C977d5a382E71F7',
  PEGASYS_GOVERNANCE_V2 = '0x3515F2b1Cc5E13a0A8AE89BF5B313D442B36aA66', // mainnet
  PEGASYS_SHORT_EXECUTOR = '0x3162c8729602EF828C3608459bF178FaA93B0d0e', // mainnet
} = process.env;
const VOTING_DURATION = 19200;

const PEGASYS_WHALE = '0x25f2226b597e8f9514b3f68f00f494cf4f286491';

task('incentives-submit-proposal:tenderly', 'Submit the incentives proposal to Pegasys Governance')
  .addParam('proposalExecutionPayload')
  .addParam('aTokens')
  .addParam('variableDebtTokens')
  .addFlag('defender')
  .setAction(
    async ({ defender, proposalExecutionPayload, aTokens, variableDebtTokens }, localBRE) => {
      await localBRE.run('set-DRE');
      let proposer: Signer;
      [proposer] = await DRE.ethers.getSigners();

      const { signer } = await getDefenderRelaySigner();
      proposer = signer;

      const whale = DRE.ethers.provider.getSigner(PEGASYS_WHALE);
      const pegasys = IERC20__factory.connect(PEGASYS_TOKEN, whale);

      // Transfer enough PEGASYS to proposer
      await (await pegasys.transfer(await proposer.getAddress(), parseEther('2000000'))).wait();

      if (!PEGASYS_TOKEN || !PEGASYS_GOVERNANCE_V2 || !PEGASYS_SHORT_EXECUTOR) {
        throw new Error(
          'You have not set correctly the .env file, make sure to read the README.md'
        );
      }

      if (aTokens.split(',').length !== 6) {
        throw new Error('aTokens input param should have 6 elements');
      }

      if (variableDebtTokens.split(',').length !== 6) {
        throw new Error('variable debt token param should have 6 elements');
      }

      const proposerAddress = await proposer.getAddress();

      // Initialize contracts and tokens
      const gov = (await DRE.ethers.getContractAt(
        'IPegasysGovernanceV2',
        PEGASYS_GOVERNANCE_V2,
        proposer
      )) as IAaveGovernanceV2;

      // Balance and proposal power check
      const balance = await pegasys.balanceOf(proposerAddress);
      const priorBlock = ((await latestBlock()) - 1).toString();
      const pegasysGovToken = IGovernancePowerDelegationToken__factory.connect(PEGASYS_TOKEN, proposer);
      const propositionPower = await pegasysGovToken.getPowerAtBlock(proposerAddress, priorBlock, '1');

      console.log('- PEGASYS Balance proposer', formatEther(balance));
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
        pegasysGovernance: PEGASYS_GOVERNANCE_V2,
        shortExecutor: PEGASYS_SHORT_EXECUTOR,
        defender: true,
      };
      console.log('- Submitting proposal with following params:');
      console.log(JSON.stringify(proposalParams, null, 2));

      await DRE.run('propose-incentives', proposalParams);
      console.log('- Proposal Submited:', proposalId.toString());

      // Mine block due flash loan voting protection
      await advanceBlockTo((await latestBlock()) + 1);

      // Submit vote and advance block to Queue phase
      try {
        console.log('Submitting vote...');
        await (await gov.submitVote(proposalId, true)).wait();
        console.log('Voted');
      } catch (error) {
        logError();
        throw error;
      }

      await advanceBlockTo((await latestBlock()) + VOTING_DURATION + 1);

      try {
        // Queue and advance block to Execution phase
        console.log('Queueing');
        await (await gov.queue(proposalId, { gasLimit: 3000000 })).wait();
        console.log('Queued');
      } catch (error) {
        logError();
        throw error;
      }
      await increaseTime(86400 + 10);

      // Execute payload

      try {
        console.log('Executing');
        await (await gov.execute(proposalId, { gasLimit: 6000000 })).wait();
      } catch (error) {
        logError();
        throw error;
      }
      console.log('Proposal executed');
    }
  );
