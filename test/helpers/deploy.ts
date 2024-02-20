import { Signer } from 'ethers';
import { ZERO_ADDRESS } from '../../helpers/constants';
import {
  deployPegasysIncentivesController,
  deployInitializableAdminUpgradeabilityProxy,
  deployMintableErc20,
} from '../../helpers/contracts-accessors';
import { getFirstSigner, insertContractAddressInDb } from '../../helpers/contracts-helpers';
import { verifyContract } from '../../helpers/etherscan-verification';
import { eContractid, tEthereumAddress } from '../../helpers/types';
import { MintableErc20, StakedPegasysV3__factory } from '../../types';

export const COOLDOWN_SECONDS = '3600'; // 1 hour in seconds
export const UNSTAKE_WINDOW = '1800'; // 30 min in second

export const testDeployIncentivesController = async (
  emissionManager: Signer,
  vaultOfRewards: Signer,
  proxyAdmin: Signer,
  pegasysToken: MintableErc20
) => {
  const emissionManagerAddress = await emissionManager.getAddress();
  // Deploy proxies and implementations
  const stakeProxy = await deployInitializableAdminUpgradeabilityProxy();
  const incentivesProxy = await deployInitializableAdminUpgradeabilityProxy();

  const pegasysStakeV3 = await deployStakedPegasysV3([
    pegasysToken.address,
    pegasysToken.address,
    COOLDOWN_SECONDS,
    UNSTAKE_WINDOW,
    await vaultOfRewards.getAddress(),
    emissionManagerAddress,
    (1000 * 60 * 60).toString(),
  ]);

  const incentivesImplementation = await deployPegasysIncentivesController([
    stakeProxy.address,
    emissionManagerAddress,
  ]);

  // Initialize proxies
  const pegasysStakeInit = pegasysStakeV3.interface.encodeFunctionData(
    // @ts-ignore
    'initialize(address,address,address,uint256,string,string,uint8)',
    [
      emissionManagerAddress,
      emissionManagerAddress,
      emissionManagerAddress,
      '2000',
      'Staked PEGASYS',
      'stkPEGASYS',
      '18',
    ]
  );
  const incentivesInit = incentivesImplementation.interface.encodeFunctionData('initialize');

  await (
    await stakeProxy['initialize(address,address,bytes)'](
      pegasysStakeV3.address,
      await proxyAdmin.getAddress(),
      pegasysStakeInit
    )
  ).wait();
  await (
    await incentivesProxy['initialize(address,address,bytes)'](
      incentivesImplementation.address,
      await proxyAdmin.getAddress(),
      incentivesInit
    )
  ).wait();

  await insertContractAddressInDb(eContractid.PegasysIncentivesController, incentivesProxy.address);

  return { incentivesProxy, stakeProxy };
};

export const deployStakedPegasysV3 = async (
  [
    stakedToken,
    rewardsToken,
    cooldownSeconds,
    unstakeWindow,
    rewardsVault,
    emissionManager,
    distributionDuration,
  ]: [
    tEthereumAddress,
    tEthereumAddress,
    string,
    string,
    tEthereumAddress,
    tEthereumAddress,
    string
  ],
  verify?: boolean
) => {
  const id = eContractid.StakedPegasysV3;
  const args: string[] = [
    stakedToken,
    rewardsToken,
    cooldownSeconds,
    unstakeWindow,
    rewardsVault,
    emissionManager,
    distributionDuration,
    ZERO_ADDRESS, // gov address
  ];
  const instance = await new StakedPegasysV3__factory(await getFirstSigner()).deploy(
    stakedToken,
    rewardsToken,
    cooldownSeconds,
    unstakeWindow,
    rewardsVault,
    emissionManager,
    distributionDuration,
    ZERO_ADDRESS // gov address);
  );
  if (verify) {
    await verifyContract(instance.address, args);
  }
  return instance;
};
