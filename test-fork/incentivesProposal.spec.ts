import { expect } from 'chai';
import rawHRE from 'hardhat';
import { BigNumber } from 'ethers';
import { formatEther, parseEther, parseUnits } from 'ethers/lib/utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { JsonRpcSigner } from '@ethersproject/providers';

import { DRE } from '../helpers/misc-utils';
import {
  increaseTime,
  latestBlock,
  advanceBlockTo,
  impersonateAccountsHardhat,
} from '../helpers/misc-utils';
import { MAX_UINT_AMOUNT, ZERO_ADDRESS } from '../helpers/constants';
import { IERC20 } from '../types/IERC20';
import { IPegasysGovernanceV2 } from '../types/IPegasysGovernanceV2';
import { ILendingPool } from '../types/ILendingPool';
import {
  StakedTokenIncentivesController__factory,
  AToken,
  AToken__factory,
  ProposalIncentivesExecutor__factory,
  SelfdestructTransfer__factory,
} from '../types';
import { tEthereumAddress } from '../helpers/types';
import { IERC20__factory } from '../types/factories/IERC20__factory';
import { IAToken__factory } from '../types/factories/IAToken__factory';
import { getRewards } from '../test/DistributionManager/data-helpers/base-math';
import { getUserIndex } from '../test/DistributionManager/data-helpers/asset-user-data';
import { IERC20Detailed__factory } from '../types/factories/IERC20Detailed__factory';
import { fullCycleLendingPool, getReserveConfigs, spendList } from './helpers';
import { deployPegasysIncentivesController } from '../helpers/contracts-accessors';
import { IGovernancePowerDelegationToken__factory } from '../types/factories/IGovernancePowerDelegationToken__factory';
import { logError } from '../helpers/tenderly-utils';

const {
  RESERVES = 'DAI,GUSD,USDC,USDT,WBTC,WETH',
  POOL_CONFIGURATOR = '0x311bb771e4f8952e6da169b425e7e92d6ac45756',
  POOL_PROVIDER = '0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5',
  POOL_DATA_PROVIDER = '0x057835Ad21a177dbdd3090bB1CAE03EaCF78Fc6d',
  ECO_RESERVE = '0x25F2226B597E8F9514B3F68F00f494cF4f286491',
  PEGASYS_TOKEN = '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
  TREASURY = '0x464c71f6c2f760dda6093dcb91c24c39e5d6e18c',
  IPFS_HASH = 'QmT9qk3CRYbFDWpDFYeAv8T8H1gnongwKhh5J68NLkLir6',
  INCENTIVES_PROXY = '0xd784927Ff2f95ba542BfC824c8a8a98F3495f6b5',
  PEGASYS_GOVERNANCE_V2 = '0xEC568fffba86c094cf06b22134B23074DFE2252c', // mainnet
  PEGASYS_SHORT_EXECUTOR = '0xee56e2b3d491590b5b31738cc34d5232f378a8d5', // mainnet
} = process.env;

if (
  !RESERVES ||
  !POOL_CONFIGURATOR ||
  !POOL_DATA_PROVIDER ||
  !ECO_RESERVE ||
  !PEGASYS_TOKEN ||
  !IPFS_HASH ||
  !PEGASYS_GOVERNANCE_V2 ||
  !PEGASYS_SHORT_EXECUTOR ||
  !TREASURY
) {
  throw new Error('You have not set correctly the .env file, make sure to read the README.md');
}

const PEGASYS_LENDING_POOL = '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9';
const VOTING_DURATION = 19200;

const PEGASYS_WHALE = '0x25f2226b597e8f9514b3f68f00f494cf4f286491';

const PEGASYS_STAKE = '0x4da27a545c0c5B758a6BA100e3a049001de870f5';
const DAI_TOKEN = '0x6b175474e89094c44da98b954eedeac495271d0f';
const DAI_HOLDER = '0x72aabd13090af25dbb804f84de6280c697ed1150';

describe('Enable incentives in target assets', () => {
  let ethers;

  let whale: JsonRpcSigner;
  let daiHolder: JsonRpcSigner;
  let proposer: SignerWithAddress;
  let incentivesProxyAdmin: SignerWithAddress;
  let incentivesProxy: tEthereumAddress;
  let gov: IPegasysGovernanceV2;
  let pool: ILendingPool;
  let pegasys: IERC20;
  let stkPegasys: IERC20;
  let dai: IERC20;
  let aDAI: AToken;
  let variableDebtDAI: IERC20;
  let proposalId: BigNumber;
  let aTokensImpl: tEthereumAddress[];
  let variableDebtTokensImpl: tEthereumAddress[];
  let proposalExecutionPayload: tEthereumAddress;
  let symbols: {
    [key: string]: {
      aToken: { symbol: string; name: string };
      variableDebtToken: { symbol: string; name: string };
    };
  } = {};

  before(async () => {
    await rawHRE.run('set-DRE');
    ethers = DRE.ethers;
    [proposer, incentivesProxyAdmin] = await DRE.ethers.getSigners();

    // Deploy incentives implementation
    const { address: incentivesImplementation } = await deployPegasysIncentivesController([
      PEGASYS_STAKE,
      PEGASYS_SHORT_EXECUTOR,
    ]);

    incentivesProxy = INCENTIVES_PROXY;

    // Deploy aTokens and debt tokens
    const { aTokens, variableDebtTokens } = await rawHRE.run('deploy-reserve-implementations', {
      provider: POOL_PROVIDER,
      assets: RESERVES,
      incentivesController: incentivesProxy,
      treasury: TREASURY,
    });

    aTokensImpl = [...aTokens];
    variableDebtTokensImpl = [...variableDebtTokens];

    // Deploy Proposal Executor Payload
    const {
      address: proposalExecutionPayloadAddress,
    } = await new ProposalIncentivesExecutor__factory(proposer).deploy();
    proposalExecutionPayload = proposalExecutionPayloadAddress;
    // Send ether to the PEGASYS_WHALE, which is a non payable contract via selfdestruct
    const selfDestructContract = await new SelfdestructTransfer__factory(proposer).deploy();
    await (
      await selfDestructContract.destroyAndTransfer(PEGASYS_WHALE, {
        value: ethers.utils.parseEther('1'),
      })
    ).wait();
    await impersonateAccountsHardhat([
      PEGASYS_WHALE,
      ...Object.keys(spendList).map((k) => spendList[k].holder),
    ]);

    // Impersonating holders
    whale = ethers.provider.getSigner(PEGASYS_WHALE);
    daiHolder = ethers.provider.getSigner(DAI_HOLDER);

    // Initialize contracts and tokens
    gov = (await ethers.getContractAt(
      'IPegasysGovernanceV2',
      PEGASYS_GOVERNANCE_V2,
      proposer
    )) as IPegasysGovernanceV2;
    pool = (await ethers.getContractAt(
      'ILendingPool',
      PEGASYS_LENDING_POOL,
      proposer
    )) as ILendingPool;

    const {
      configuration: { data },
      aTokenAddress,
      variableDebtTokenAddress,
    } = await pool.getReserveData(DAI_TOKEN);

    pegasys = IERC20__factory.connect(PEGASYS_TOKEN, whale);
    stkPegasys = IERC20__factory.connect(PEGASYS_STAKE, proposer);
    dai = IERC20__factory.connect(DAI_TOKEN, daiHolder);
    aDAI = AToken__factory.connect(aTokenAddress, proposer);
    variableDebtDAI = IERC20__factory.connect(variableDebtTokenAddress, proposer);

    // Transfer enough PEGASYS to proposer
    await (await pegasys.transfer(proposer.address, parseEther('2000000'))).wait();

    // Transfer DAI to repay future DAI loan
    await (await dai.transfer(proposer.address, parseEther('100000'))).wait();

    // Save aToken and debt token names
    const reserveConfigs = await getReserveConfigs(POOL_PROVIDER, RESERVES, proposer);

    for (let x = 0; x < reserveConfigs.length; x++) {
      const { tokenAddress, symbol } = reserveConfigs[x];
      const { aTokenAddress, variableDebtTokenAddress } = await pool.getReserveData(
        reserveConfigs[x].tokenAddress
      );
      const aToken = IERC20Detailed__factory.connect(aTokenAddress, proposer);
      const varDebtToken = IERC20Detailed__factory.connect(variableDebtTokenAddress, proposer);

      symbols[symbol] = {
        aToken: {
          name: await aToken.name(),
          symbol: await aToken.symbol(),
        },
        variableDebtToken: {
          name: await varDebtToken.name(),
          symbol: await varDebtToken.symbol(),
        },
      };
    }
  });

  it('Proposal should be created', async () => {
    await advanceBlockTo((await latestBlock()) + 10);

    try {
      const balance = await pegasys.balanceOf(proposer.address);
      console.log('PEGASYS Balance proposer', formatEther(balance));
      const pegasysGovToken = IGovernancePowerDelegationToken__factory.connect(PEGASYS_TOKEN, proposer);
      const propositionPower = await pegasysGovToken.getPowerAtBlock(
        proposer.address,
        ((await latestBlock()) - 1).toString(),
        '1'
      );

      console.log(
        `Proposition power of ${proposer.address} at block - 1`,
        formatEther(propositionPower)
      );
    } catch (error) {
      console.log(error);
    }
    // Submit proposal
    proposalId = await gov.getProposalsCount();

    await DRE.run('propose-incentives', {
      proposalExecutionPayload,
      aTokens: aTokensImpl.join(','),
      variableDebtTokens: variableDebtTokensImpl.join(','),
      pegasysGovernance: PEGASYS_GOVERNANCE_V2,
      shortExecutor: PEGASYS_SHORT_EXECUTOR,
      ipfsHash: IPFS_HASH,
    });
    console.log('submited');

    // Mine block due flash loan voting protection
    await advanceBlockTo((await latestBlock()) + 1);

    // Submit vote and advance block to Queue phase
    await (await gov.submitVote(proposalId, true)).wait();
    await advanceBlockTo((await latestBlock()) + VOTING_DURATION + 1);
  });

  it('Proposal should be queued', async () => {
    // Queue and advance block to Execution phase
    await (await gov.queue(proposalId)).wait();
    let proposalState = await gov.getProposalState(proposalId);
    expect(proposalState).to.be.equal(5);

    await increaseTime(86400 + 10);
  });

  it('Proposal should be executed', async () => {
    // Execute payload
    try {
      await (await gov.execute(proposalId, { gasLimit: 3000000 })).wait();
    } catch (error) {
      logError();
      throw error;
    }

    console.log('Proposal executed');

    const proposalState = await gov.getProposalState(proposalId);
    expect(proposalState).to.be.equal(7);
  });

  it('Check emission rate', async () => {
    const incentives = StakedTokenIncentivesController__factory.connect(incentivesProxy, proposer);
    const tokenAddress = DAI_TOKEN;
    const { aTokenAddress, variableDebtTokenAddress } = await pool.getReserveData(tokenAddress);
    const reserve = IERC20__factory.connect(tokenAddress, proposer);

    // Amounts
    const depositAmount = parseEther('10000');

    // Deposit to LendingPool
    await (await reserve.connect(proposer).approve(pool.address, '0')).wait();
    await (await reserve.connect(proposer).approve(pool.address, depositAmount)).wait();
    await (
      await pool.connect(proposer).deposit(reserve.address, depositAmount, proposer.address, 0)
    ).wait();

    // Check unclaimed rewards before time travel and claim
    const unclaimedRewardsBefore = await incentives.getRewardsBalance(
      [aTokenAddress],
      proposer.address
    );

    await increaseTime(86400);

    const atokenBalance = await IAToken__factory.connect(aTokenAddress, proposer).scaledBalanceOf(
      proposer.address
    );
    const priorStkBalance = await IERC20__factory.connect(stkPegasys.address, proposer).balanceOf(
      proposer.address
    );
    const userIndexBefore = await getUserIndex(incentives, proposer.address, aTokenAddress);

    // Claim after timetravel
    const tx2 = await incentives
      .connect(proposer)
      .claimRewards([aTokenAddress], MAX_UINT_AMOUNT, proposer.address);

    expect(tx2).to.emit(incentives, 'RewardsClaimed');
    const afterStkBalance = await stkPegasys.balanceOf(proposer.address);
    const claimed = afterStkBalance.sub(priorStkBalance);

    const userIndexAfter = await getUserIndex(incentives, proposer.address, aTokenAddress);
    const expectedAccruedRewards = getRewards(
      atokenBalance,
      userIndexAfter,
      userIndexBefore
    ).toString();

    // Expected rewards by index + prior accrued rewards
    const expectedClaimedRewards = BigNumber.from(expectedAccruedRewards).add(
      unclaimedRewardsBefore
    );

    expect(afterStkBalance).to.be.gt(priorStkBalance);
    expect(claimed).to.be.eq(expectedClaimedRewards);
  });

  it('Users should be able to deposit DAI at Lending Pool', async () => {
    // Deposit DAI to LendingPool
    await (await dai.connect(proposer).approve(pool.address, parseEther('2000'))).wait();

    const tx = await pool.deposit(dai.address, parseEther('100'), proposer.address, 0);
    expect(tx).to.emit(pool, 'Deposit');
    expect(await aDAI.balanceOf(proposer.address)).to.be.gte(parseEther('100'));
  });

  it('Users should be able to request DAI loan from Lending Pool', async () => {
    // Request DAI loan to LendingPool
    const tx = await pool.borrow(dai.address, parseEther('1'), '2', '0', proposer.address);
    expect(tx).to.emit(pool, 'Borrow');
    expect(await variableDebtDAI.balanceOf(proposer.address)).to.be.eq(parseEther('1'));
  });

  it('Users should be able to repay DAI loan from Lending Pool', async () => {
    const {
      configuration: { data },
      variableDebtTokenAddress,
    } = await pool.getReserveData(DAI_TOKEN);

    // Repay DAI variable loan to LendingPool
    await (await dai.connect(proposer).approve(pool.address, MAX_UINT_AMOUNT)).wait();
    const tx = await pool.repay(dai.address, MAX_UINT_AMOUNT, '2', proposer.address);
    expect(tx).to.emit(pool, 'Repay');
  });

  it('Users should be able to withdraw DAI from Lending Pool', async () => {
    const {
      configuration: { data },
      aTokenAddress,
    } = await pool.getReserveData(DAI_TOKEN);

    // Withdraw DAI from LendingPool
    const priorDAIBalance = await dai.balanceOf(proposer.address);
    await (await aDAI.connect(proposer).approve(pool.address, MAX_UINT_AMOUNT)).wait();
    const tx = await pool.withdraw(dai.address, MAX_UINT_AMOUNT, proposer.address);
    expect(tx).to.emit(pool, 'Withdraw');
    const afterDAIBalance = await dai.balanceOf(proposer.address);
    expect(await aDAI.balanceOf(proposer.address)).to.be.eq('0');
    expect(afterDAIBalance).to.be.gt(priorDAIBalance);
  });

  it('User should be able to interact with LendingPool with DAI/GUSD/USDC/USDT/WBTC/WETH', async () => {
    const reserveConfigs = await getReserveConfigs(POOL_PROVIDER, RESERVES, proposer);

    // Deposit PEGASYS to LendingPool to have enought collateral for future borrows
    await (await pegasys.connect(proposer).approve(pool.address, parseEther('1000'))).wait();
    await (
      await pool.connect(proposer).deposit(pegasys.address, parseEther('1000'), proposer.address, 0)
    ).wait();

    for (let x = 0; x < reserveConfigs.length; x++) {
      const { symbol, tokenAddress } = reserveConfigs[x];
      await fullCycleLendingPool(symbol, tokenAddress, proposer, pool);
    }
  });

  it('Check all aToken symbols and debt token matches', async () => {
    const reserveConfigs = await getReserveConfigs(POOL_PROVIDER, RESERVES, proposer);

    for (let x = 0; x < reserveConfigs.length; x++) {
      const { tokenAddress, symbol } = reserveConfigs[x];
      const { aTokenAddress, variableDebtTokenAddress } = await pool.getReserveData(tokenAddress);
      const aToken = IERC20Detailed__factory.connect(aTokenAddress, proposer);
      const varDebtToken = IERC20Detailed__factory.connect(variableDebtTokenAddress, proposer);

      const aTokenDetails = {
        name: await aToken.name(),
        symbol: await aToken.symbol(),
      };
      const variableDebtTokenDetails = {
        name: await varDebtToken.name(),
        symbol: await varDebtToken.symbol(),
      };

      expect(aTokenDetails).to.be.deep.equal(symbols[symbol].aToken);
      expect(variableDebtTokenDetails).to.be.deep.equal(symbols[symbol].variableDebtToken);
    }
  });

  it('Users should be able to claim incentives', async () => {
    // Initialize proxy for incentives controller
    const incentives = StakedTokenIncentivesController__factory.connect(incentivesProxy, proposer);
    const reserveConfigs = await getReserveConfigs(POOL_PROVIDER, RESERVES, proposer);

    for (let x = 0; x < reserveConfigs.length; x++) {
      const { tokenAddress, symbol } = reserveConfigs[x];
      const { aTokenAddress, variableDebtTokenAddress } = await pool.getReserveData(
        reserveConfigs[x].tokenAddress
      );
      const reserve = IERC20__factory.connect(tokenAddress, proposer);

      // Amounts
      const depositAmount = parseUnits(spendList[symbol].deposit, spendList[symbol].decimals);

      // Deposit to LendingPool
      await (await reserve.connect(proposer).approve(pool.address, '0')).wait();
      await (await reserve.connect(proposer).approve(pool.address, depositAmount)).wait();
      const depositTx = await (
        await pool.connect(proposer).deposit(reserve.address, depositAmount, proposer.address, 0)
      ).wait();

      await increaseTime(86400);

      const priorBalance = await stkPegasys.balanceOf(proposer.address);
      const tx = await incentives
        .connect(proposer)
        .claimRewards([aTokenAddress, variableDebtTokenAddress], MAX_UINT_AMOUNT, proposer.address);
      await tx.wait();
      expect(tx).to.emit(incentives, 'RewardsClaimed');

      const afterBalance = await stkPegasys.balanceOf(proposer.address);
      expect(afterBalance).to.be.gt(priorBalance);
    }
  });

  it('User should be able to interact with LendingPool with DAI/GUSD/USDC/USDT/WBTC/WETH', async () => {
    const incentives = StakedTokenIncentivesController__factory.connect(incentivesProxy, proposer);
    const distributionEnd = await incentives.getDistributionEnd();

    const { timestamp } = await DRE.ethers.provider.getBlock('latest');
    const timeLeft = Number(distributionEnd.sub(timestamp.toString()).toString());

    await increaseTime(timeLeft + 1);

    const reserveConfigs = await getReserveConfigs(POOL_PROVIDER, RESERVES, proposer);

    for (let x = 0; x < reserveConfigs.length; x++) {
      const { symbol, tokenAddress } = reserveConfigs[x];
      const { aTokenAddress, variableDebtTokenAddress } = await pool.getReserveData(tokenAddress);
      // Claim any leftovers
      await (
        await incentives
          .connect(proposer)
          .claimRewards(
            [aTokenAddress, variableDebtTokenAddress],
            MAX_UINT_AMOUNT,
            proposer.address
          )
      ).wait();

      // Do full cycle of actions at Lending Pool
      await fullCycleLendingPool(symbol, tokenAddress, proposer, pool);
    }
  });
});
