#!/usr/bin/env node
/**
 * Deploy Agent007Registry V1 to Base Mainnet
 */

const { Wallet, JsonRpcProvider, ContractFactory } = require('ethers');
const solc = require('solc');
const fs = require('fs');
const path = require('path');

async function main() {
  // Load environment
  require('dotenv').config();

  const RPC_URL = process.env.BLOCKCHAIN_RPC_URL || 'https://mainnet.base.org';
  const PRIVATE_KEY = process.env.BLOCKCHAIN_PRIVATE_KEY;

  if (!PRIVATE_KEY) {
    console.error('ERROR: BLOCKCHAIN_PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  console.log('Agent007 Registry V1 - Deployment');
  console.log('==================================');
  console.log('Chain: Base Mainnet');
  console.log('RPC:', RPC_URL);

  // Connect to network
  const provider = new JsonRpcProvider(RPC_URL);
  const wallet = new Wallet(PRIVATE_KEY, provider);

  console.log('Deployer:', wallet.address);

  // Check balance
  const balance = await provider.getBalance(wallet.address);
  console.log('Balance:', (Number(balance) / 1e18).toFixed(4), 'ETH');

  if (balance < BigInt(1e15)) {
    console.error('ERROR: Insufficient balance for deployment');
    process.exit(1);
  }

  // Read contract source
  const contractPath = path.join(__dirname, '../contracts/Agent007Registry.sol');
  const source = fs.readFileSync(contractPath, 'utf8');

  console.log('\nCompiling contract...');

  // Compile
  const input = {
    language: 'Solidity',
    sources: {
      'Agent007Registry.sol': { content: source }
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        '*': { '*': ['abi', 'evm.bytecode'] }
      }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  // Check for errors
  if (output.errors) {
    const errors = output.errors.filter(e => e.severity === 'error');
    if (errors.length > 0) {
      console.error('Compilation errors:');
      errors.forEach(e => console.error(e.formattedMessage));
      process.exit(1);
    }
  }

  const contract = output.contracts['Agent007Registry.sol']['Agent007Registry'];
  const abi = contract.abi;
  const bytecode = contract.evm.bytecode.object;

  console.log('Compiled successfully');
  console.log('Bytecode size:', bytecode.length / 2, 'bytes');

  // Estimate gas
  console.log('\nEstimating gas...');
  const factory = new ContractFactory(abi, bytecode, wallet);
  const deployTx = await factory.getDeployTransaction();
  const gasEstimate = await provider.estimateGas({ ...deployTx, from: wallet.address });
  const feeData = await provider.getFeeData();

  const estimatedCost = gasEstimate * feeData.gasPrice;
  console.log('Estimated gas:', gasEstimate.toString());
  console.log('Gas price:', (Number(feeData.gasPrice) / 1e9).toFixed(2), 'gwei');
  console.log('Estimated cost:', (Number(estimatedCost) / 1e18).toFixed(6), 'ETH');

  // Deploy
  console.log('\nDeploying...');
  const deployedContract = await factory.deploy();
  console.log('Transaction hash:', deployedContract.deploymentTransaction().hash);

  console.log('Waiting for confirmation...');
  await deployedContract.waitForDeployment();

  const contractAddress = await deployedContract.getAddress();

  console.log('\n==================================');
  console.log('DEPLOYED SUCCESSFULLY');
  console.log('==================================');
  console.log('Contract Address:', contractAddress);
  console.log('Transaction:', deployedContract.deploymentTransaction().hash);
  console.log('Block Explorer: https://basescan.org/address/' + contractAddress);
  console.log('\nNext steps:');
  console.log('1. Update .env: BLOCKCHAIN_CONTRACT_ADDRESS=' + contractAddress);
  console.log('2. Verify on Basescan (optional)');
}

main().catch(err => {
  console.error('Deployment failed:', err.message);
  process.exit(1);
});
