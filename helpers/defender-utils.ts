import { formatEther } from '@ethersproject/units';
import { DefenderRelaySigner, DefenderRelayProvider } from 'defender-relay-client/lib/ethers';
import { Signer } from 'ethers';
import { DRE, impersonateAccountsHardhat } from './misc-utils';

export const getDefenderRelaySigner = async () => {
  const { DEFENDER_API_KEY, DEFENDER_SECRET_KEY } = process.env;
  let signer: Signer;

  if (!DEFENDER_API_KEY || !DEFENDER_SECRET_KEY) {
    throw new Error('Defender secrets required');
  }

  const credentials = { apiKey: DEFENDER_API_KEY, apiSecret: DEFENDER_SECRET_KEY };

  console.log('credentials===>',credentials);

  signer = new DefenderRelaySigner(credentials, new DefenderRelayProvider(credentials), {
    speed: 'fast',
  });

  const defenderAddress = await signer.getAddress();
  console.log('defenderAddress===>',defenderAddress);

  // Reemplace signer if MAINNET_FORK is active
  if (process.env.MAINNET_FORK === 'true') {
    console.log('  - Impersonating Defender Relay');
    await impersonateAccountsHardhat([defenderAddress]);
    signer = await DRE.ethers.getSigner(defenderAddress);
  }
  // Reemplace signer if Tenderly network is active
  if (DRE.network.name.includes('tenderly')) {
    console.log('  - Impersonating Defender Relay via Tenderly');
    signer = await DRE.ethers.getSigner(defenderAddress);
  }
  console.log('  - Balance: ', formatEther(await signer.getBalance()));
  // console.log('signer===>',signer)
  const deployer = await DRE.ethers.getSigner('0x5Dda19AC38b19788A7842819d6673034006090E1');
  console.log(deployer);
  return { signer:deployer, address: '0x5Dda19AC38b19788A7842819d6673034006090E1' };
};
