import rawBRE from 'hardhat';
import { Signer, ethers } from 'ethers';
import { getBlockTimestamp, getEthersSigners } from '../helpers/contracts-helpers';
import { initializeMakeSuite } from './helpers/make-suite';
import { deployMintableErc20, deployATokenMock } from '../helpers/contracts-accessors';
import { DRE, waitForTx } from '../helpers/misc-utils';
import { MintableErc20 } from '../types/MintableErc20';
import { testDeployIncentivesController } from './helpers/deploy';
import {
  PullRewardsIncentivesController,
  PullRewardsIncentivesController__factory,
  StakedPegasysV3__factory,
  StakedTokenIncentivesController__factory,
} from '../types';
import { parseEther } from '@ethersproject/units';
import { hrtime } from 'process';
import { MAX_UINT_AMOUNT } from '../helpers/constants';

const topUpWalletsWithPegasys = async (
  wallets: Signer[],
  pegasysToken: MintableErc20,
  amount: string
) => {
  for (const wallet of wallets) {
    await waitForTx(await pegasysToken.connect(wallet).mint(amount));
  }
};

const buildTestEnv = async (
  deployer: Signer,
  vaultOfRewards: Signer,
  proxyAdmin: Signer,
  restWallets: Signer[]
) => {
  console.time('setup');

  const pegasysToken = await deployMintableErc20(['Pegasys', 'pegasys']);

  await waitForTx(await pegasysToken.connect(vaultOfRewards).mint(ethers.utils.parseEther('2000000')));
  await topUpWalletsWithPegasys(
    [restWallets[0], restWallets[1], restWallets[2], restWallets[3], restWallets[4]],
    pegasysToken,
    ethers.utils.parseEther('100').toString()
  );

  const { incentivesProxy, stakeProxy } = await testDeployIncentivesController(
    deployer,
    vaultOfRewards,
    proxyAdmin,
    pegasysToken
  );
  const { proxy: baseIncentivesProxy } = await DRE.run('deploy-pull-rewards-incentives', {
    emissionManager: await deployer.getAddress(),
    rewardToken: pegasysToken.address,
    rewardsVault: await vaultOfRewards.getAddress(),
    proxyAdmin: await proxyAdmin.getAddress(),
  });

  await waitForTx(
    await pegasysToken.connect(vaultOfRewards).approve(baseIncentivesProxy, MAX_UINT_AMOUNT)
  );

  const distributionDuration = ((await getBlockTimestamp()) + 1000 * 60 * 60).toString();
  await deployATokenMock(incentivesProxy.address, 'aDai');
  await deployATokenMock(incentivesProxy.address, 'aWeth');

  await deployATokenMock(baseIncentivesProxy, 'aDaiBase');
  await deployATokenMock(baseIncentivesProxy, 'aWethBase');

  const incentivesController = StakedTokenIncentivesController__factory.connect(
    incentivesProxy.address,
    deployer
  );
  const pullRewardsIncentivesController = PullRewardsIncentivesController__factory.connect(
    baseIncentivesProxy,
    deployer
  );

  await incentivesController.setDistributionEnd(distributionDuration);
  await pullRewardsIncentivesController.setDistributionEnd(distributionDuration);
  await waitForTx(
    await pegasysToken
      .connect(vaultOfRewards)
      .transfer(incentivesController.address, parseEther('1000000'))
  );

  console.timeEnd('setup');

  return {
    pegasysToken,
    incentivesController,
    pullRewardsIncentivesController,
    pegasysStake: StakedPegasysV3__factory.connect(stakeProxy.address, deployer),
  };
};

before(async () => {
  await rawBRE.run('set-DRE');
  const [deployer, proxyAdmin, rewardsVault, ...restWallets] = await getEthersSigners();
  const {
    pegasysToken,
    pegasysStake,
    incentivesController,
    pullRewardsIncentivesController,
  } = await buildTestEnv(deployer, rewardsVault, proxyAdmin, restWallets);
  await initializeMakeSuite(
    pegasysToken,
    pegasysStake,
    incentivesController,
    pullRewardsIncentivesController
  );
  console.log('\n***************');
  console.log('Setup and snapshot finished');
  console.log('***************\n');
});
