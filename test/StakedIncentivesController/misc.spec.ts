import { timeLatest, waitForTx } from '../../helpers/misc-utils';

import { expect } from 'chai';

import { makeSuite } from '../helpers/make-suite';
import { deployPegasysIncentivesController } from '../../helpers/contracts-accessors';
import { MAX_UINT_AMOUNT, RANDOM_ADDRESSES, ZERO_ADDRESS } from '../../helpers/constants';

makeSuite('PegasysIncentivesController misc tests', (testEnv) => {
  it('constructor should assign correct params', async () => {
    const peiEmissionManager = RANDOM_ADDRESSES[1];
    const psm = RANDOM_ADDRESSES[5];

    const pegasysIncentivesController = await deployPegasysIncentivesController([
      psm,
      peiEmissionManager,
    ]);
    await expect(await pegasysIncentivesController.STAKE_TOKEN()).to.be.equal(psm);
    await expect((await pegasysIncentivesController.EMISSION_MANAGER()).toString()).to.be.equal(
      peiEmissionManager
    );
  });

  it('Should return same index while multiple asset index updates', async () => {
    const { aDaiMock, pegasysIncentivesController, users } = testEnv;
    await waitForTx(await pegasysIncentivesController.configureAssets([aDaiMock.address], ['100']));
    await waitForTx(await aDaiMock.doubleHandleActionOnAic(users[1].address, '2000', '100'));
  });

  it('Should overflow index if passed a large emission', async () => {
    const { aDaiMock, pegasysIncentivesController, users } = testEnv;
    const MAX_104_UINT = '20282409603651670423947251286015';

    await waitForTx(
      await pegasysIncentivesController.configureAssets([aDaiMock.address], [MAX_104_UINT])
    );
    await expect(
      aDaiMock.doubleHandleActionOnAic(users[1].address, '2000', '100')
    ).to.be.revertedWith('Index overflow');
  });

  it('Should configureAssets revert if parameters length does not match', async () => {
    const { aDaiMock, pegasysIncentivesController } = testEnv;

    await expect(
      pegasysIncentivesController.configureAssets([aDaiMock.address], ['1', '2'])
    ).to.be.revertedWith('INVALID_CONFIGURATION');
  });

  it('Should configureAssets revert if emission parameter overflows uin104', async () => {
    const { aDaiMock, pegasysIncentivesController } = testEnv;

    await expect(
      pegasysIncentivesController.configureAssets([aDaiMock.address], [MAX_UINT_AMOUNT])
    ).to.be.revertedWith('Index overflow at emissionsPerSecond');
  });

  it('Should REWARD_TOKEN getter returns the stake token address to keep old interface compatibility', async () => {
    const { pegasysIncentivesController, stakedPegasys } = testEnv;
    await expect(await pegasysIncentivesController.REWARD_TOKEN()).to.be.equal(stakedPegasys.address);
  });

  it('Should claimRewards revert if to argument is ZERO_ADDRESS', async () => {
    const { pegasysIncentivesController, users, aDaiMock, stakedPegasys } = testEnv;
    const [userWithRewards] = users;

    await waitForTx(await pegasysIncentivesController.configureAssets([aDaiMock.address], ['2000']));
    await waitForTx(await aDaiMock.setUserBalanceAndSupply('300000', '30000'));

    // Claim from third party claimer
    await expect(
      pegasysIncentivesController
        .connect(userWithRewards.signer)
        .claimRewards([aDaiMock.address], MAX_UINT_AMOUNT, ZERO_ADDRESS)
    ).to.be.revertedWith('INVALID_TO_ADDRESS');
  });
});
