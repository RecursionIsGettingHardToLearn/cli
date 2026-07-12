const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('RegistroRecetas', function () {
  let contract;
  let owner, otroFirmante;
  const HASH_A = ethers.id('documento-a');
  const HASH_B = ethers.id('documento-b');
  const PACIENTE_1 = ethers.id('paciente-uuid-1');
  const PACIENTE_2 = ethers.id('paciente-uuid-2');
  const MEDICO_1 = ethers.id('medico-uid-1');

  beforeEach(async function () {
    [owner, otroFirmante] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory('RegistroRecetas');
    contract = await Factory.deploy();
    await contract.waitForDeployment();
  });

  it('registra un hash y emite evento', async function () {
    await expect(contract.registrar(HASH_A, PACIENTE_1, MEDICO_1))
      .to.emit(contract, 'RecetaRegistrada');
    expect(await contract.total()).to.equal(1n);
  });

  it('verifica un hash registrado', async function () {
    await contract.registrar(HASH_A, PACIENTE_1, MEDICO_1);
    const [exists, id, ts] = await contract.verificar(HASH_A);
    expect(exists).to.be.true;
    expect(id).to.equal(0n);
    expect(ts).to.be.greaterThan(0n);
  });

  it('verifica un hash NO registrado', async function () {
    const [exists] = await contract.verificar(HASH_B);
    expect(exists).to.be.false;
  });

  it('rechaza hash duplicado', async function () {
    await contract.registrar(HASH_A, PACIENTE_1, MEDICO_1);
    await expect(contract.registrar(HASH_A, PACIENTE_2, MEDICO_1))
      .to.be.revertedWith('Hash ya registrado');
  });

  it('rechaza hash vacio', async function () {
    await expect(contract.registrar(ethers.ZeroHash, PACIENTE_1, MEDICO_1))
      .to.be.revertedWith('Hash vacio');
  });

  it('lista recetas por paciente', async function () {
    await contract.registrar(HASH_A, PACIENTE_1, MEDICO_1);
    await contract.registrar(HASH_B, PACIENTE_1, MEDICO_1);
    const indices = await contract.recetasDe(PACIENTE_1);
    expect(indices.length).to.equal(2);
    expect(indices[0]).to.equal(0n);
    expect(indices[1]).to.equal(1n);
  });
});
