const hre = require("hardhat");

async function main() {
  console.log(`Deploying LogIntegrity contract to network: ${hre.network.name}...`);

  const LogIntegrity = await hre.ethers.getContractFactory("LogIntegrity");
  const contract = await LogIntegrity.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`✅ LogIntegrity deployed to: ${address}`);
  console.log(`\nAdd this to your .env file:`);
  console.log(`CONTRACT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
