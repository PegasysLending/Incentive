import { task } from 'hardhat/config';
import { DefenderRelaySigner, DefenderRelayProvider } from 'defender-relay-client/lib/ethers';
import { deployAaveIncentivesController } from '../../helpers/contracts-accessors';
import { getDefenderRelaySigner } from '../../helpers/defender-utils';

// Mainnet addresses
const AAVE_STAKE = '0x9C716BA14d87c53041bB7fF95C977d5a382E71F7';
const AAVE_SHORT_EXECUTOR = '0x5Dda19AC38b19788A7842819d6673034006090E1';

task('deploy-incentives-impl', 'Incentives controller implementation deployment').setAction(
  async (_, localBRE) => {
    _;
    await localBRE.run('set-DRE');

    const { signer } = await getDefenderRelaySigner();
    const deployer = signer;

    const incentives = await deployAaveIncentivesController(
      [AAVE_STAKE, AAVE_SHORT_EXECUTOR],
      true,
      deployer
    );
    console.log(`- Incentives implementation address ${incentives.address}`);

    return incentives.address;
  }
);
