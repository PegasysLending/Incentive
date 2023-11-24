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
      "0xabcf75C33199Fb431Ac9C8F92912b620BF9C30C5",
      "0x18D7A24402E86322681c44bfA5de40B4A2aeBaEB",
      "0xbc87e2892A5f6F968226e1752FC5Ca8C1a2fbEA0",
      "0x33d848692f7bd9CE43F8bE2eD6E7F49E8F4De04D"
    ],[
      "0xe92FCEB4EBD179ADd84d6fee6b28ac01f81970a8",
      "0xb27CE44d1D96C138ead4aEc2991595845224F2Ec",
      "0x604c15e06737d4D51fA238199849b2e113B5eB47",
      "0xaa814719a4a03DFF342f531e1e941F4d303a549b"
    ]);
    const txRes = await wait();
    console.log(`txid:==>`,txRes);
  });
