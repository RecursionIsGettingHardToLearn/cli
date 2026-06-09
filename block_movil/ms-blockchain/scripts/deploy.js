const { ethers, network, run } = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log(`Desplegando RegistroRecetas en network=${network.name}`);

  const Factory = await ethers.getContractFactory('RegistroRecetas');
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`Contrato desplegado en: ${address}`);

  // Guardar address en un archivo para que el server.js lo lea
  const deploymentsDir = path.join(__dirname, '..', 'deployments');
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir);
  fs.writeFileSync(
    path.join(deploymentsDir, `${network.name}.json`),
    JSON.stringify({ address, network: network.name, chainId: network.config.chainId }, null, 2)
  );
  console.log(`Address guardada en deployments/${network.name}.json`);

  // Verificar en explorer si es Amoy y hay API key
  if (network.name === 'amoy' && process.env.POLYGONSCAN_API_KEY) {
    console.log('Esperando 5 confirmaciones antes de verificar...');
    await contract.deploymentTransaction().wait(5);
    try {
      await run('verify:verify', { address, constructorArguments: [] });
      console.log('Contrato verificado en Polygonscan');
    } catch (e) {
      console.warn('verify fallo (puede que ya este verificado):', e.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
