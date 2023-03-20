import alchemy from "./alchemy";
import * as ethers from "ethers";

const SAFE_GET_OWNERS_ABI = [
  "function getOwners() public view returns (address[] memory)"
];

export const isMultiSig = async (address: string): Promise<boolean> => {
  const code = await alchemy.core.getCode(address);
  return code !== "0x";
};

export const getOwners = async (multisigAddress: string): Promise<string[]> => {
  let iface = new ethers.Interface(SAFE_GET_OWNERS_ABI);
  let data = iface.encodeFunctionData("getOwners", []);

  let result = await alchemy.core.call({
    to: multisigAddress,
    data
  });

  let owners = iface.decodeFunctionResult("getOwners", result);
  return owners;
};
