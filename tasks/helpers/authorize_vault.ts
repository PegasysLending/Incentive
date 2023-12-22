import { isAddress } from "ethers/lib/utils";
import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { IERC20, PullRewardsIncentivesController } from "../../types";
import { BigNumber } from "ethers";
import { eContractid } from "../../helpers/types";
import { isZeroAddress } from "ethereumjs-util";
import { waitForTx } from "../../helpers/misc-utils";


task(`authorize-vault`, `Authorize rewards vault to incentives`)
  .addParam('rewardToken')
  .addParam('rewardsVault')
  .addParam('incentives', 'The address of IncentivesController')
  .addParam('amount', 'authorize the amount of rewardTokenn')
  .setAction(async( {rewardToken, rewardsVault, incentives, amount}, localBRE: HardhatRuntimeEnvironment) => {
    await localBRE.run('set-DRE')
    const [owner] = await localBRE.ethers.getSigners();
    if (!isAddress(rewardToken)) {
      throw Error('Missing or incorrect rewardToken param');
    }
    if (!isAddress(rewardsVault)) {
      throw Error('Missing or incorrect rewardsVault param');
    }
    if (!isAddress(incentives)) {
      throw Error('Missing or incorrect incentives controller address');
    }
    if (!amount) {
      throw Error('Missing or zero amount')
    }

    const rewardTokenContract = (await localBRE.ethers.getContractAt("@aave/aave-stake/contracts/interfaces/IERC20.sol:IERC20", rewardToken) as IERC20)
    const incentivesControllerContract = (await localBRE.ethers.getContractAt(eContractid.PullRewardsIncentivesController, incentives)) as PullRewardsIncentivesController;
    const storedRewardsVault = await incentivesControllerContract.getRewardsVault();
    if (storedRewardsVault != rewardsVault) {
      if (isZeroAddress(storedRewardsVault)) {
        const tx = await waitForTx(await incentivesControllerContract.setRewardsVault(rewardsVault))
        console.log(tx.events);
      } else {
        throw Error(`rewardsVault(${rewardsVault}) is not match the value(${storedRewardsVault}) stored in centives`)
      }
      
    }
    await rewardTokenContract.connect(owner).approve(incentives, amount+'000000000000000000');

  })

  task('authorize_vault_allowance', `Check the allowance from rewardsVault to incentives`)
    .addParam('rewardToken')
    .addParam('rewardsVault')
    .addParam('incentives')
    .setAction(async({  rewardToken ,rewardsVault, incentives}, localBER: HardhatRuntimeEnvironment) => {
      if (!isAddress(rewardsVault)) {
        throw Error('Missing or incorrect rewardsVault param');
      }
      if (!isAddress(incentives)) {
        throw Error('Missing or incorrect incentives controller address');
      }
      const rewardTokenContract = (await localBER.ethers.getContractAt("@aave/aave-stake/contracts/interfaces/IERC20.sol:IERC20", rewardToken) as IERC20)
      const allowance = await rewardTokenContract.allowance(rewardsVault, incentives);
      console.log(allowance.toString());
    })