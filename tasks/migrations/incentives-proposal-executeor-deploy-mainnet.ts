import { task } from 'hardhat/config';
import { DRE } from '../../helpers/misc-utils';
import { ProposalIncentivesExecutor__factory } from '../../types';
import { Signer } from 'ethers';

// npx hardhat --network main incentives-proposal-executeor-deploy:mainnet
task(
  'incentives-proposal-executeor-deploy:mainnet',
  'Execute proposals through existing tokens and variable debt token implementations'
)
  .setAction(async ({},localBRE) => {

    await localBRE.run('set-DRE');

    let deployer: Signer;
    [deployer] = await DRE.ethers.getSigners();

    console.log('- Deploying ProposalIncentivesExecutor implementations');
    const res = await new ProposalIncentivesExecutor__factory(deployer).deploy();
    console.log(`address:${res.address}`);
    const {wait} = await res.execute([
      "0xD0ae867E8971d9790675162693EfA63Cc475d62E",
      "0x04C91c4Ef4F2314511EB89ecC6Fd8AaC37CE65Ef",
      "0x4ddc1fd9A581cd0177e78f330Fb8aDbcfC04BA56"
    ],[
      "0x5646598243B0Fc725AFDE3b8dbA2Ab3595498D85",
      "0xE1658D382Da60207BB8f782CfBaE1a8857faBB74",
      "0x4cD15aE81f44f8830ca517E43b0a9F706AE13297"
    ]);
    const txid = await wait();
    console.log(`txid:${txid}`);
  });
