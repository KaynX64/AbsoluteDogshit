import { spawn, spawnSync } from 'node:child_process';
import { createPrivateKey, X509Certificate } from 'node:crypto';
import { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmdirSync, rmSync } from 'node:fs';
import { get } from 'node:https';
import { createRequire } from 'node:module';
import { isIPv4 } from 'node:net';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { checkServerIdentity } from 'node:tls';
import { setTimeout as delay } from 'node:timers/promises';

const mobileDirectory = import.meta.dirname;
const serverDirectory = join(mobileDirectory, '..', 'server');
const certDirectory = join(serverDirectory, 'certs');
const caName = 'android-dev-ca.pem';
const caKeyName = 'android-dev-ca-key.pem';

async function chooseAddress(address) {
  const addresses = Object.entries(networkInterfaces()).flatMap(([name, entries]) =>
    entries.filter(entry => entry.family === 'IPv4' && !entry.internal)
      .map(entry => ({ name, ip: entry.address })));

  if (!address) {
    console.log('IPv4 addresses on this PC:');
    for (const { name, ip } of addresses) console.log(`  ${ip}  (${name})`);
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    try {
      address = (await terminal.question('Enter the LAN IP your phone can reach, or 10.0.2.2 for an emulator: ')).trim();
    } finally {
      terminal.close();
    }
  }

  if (!isIPv4(address) || (address !== '10.0.2.2' && !addresses.some(entry => entry.ip === address))) {
    throw new Error('Choose an IPv4 address assigned to this PC, or 10.0.2.2 for the Android emulator.');
  }
  return address;
}

function openssl(args) {
  const result = spawnSync('openssl.exe', args, { encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  return result;
}

function verifyCertificate(ca, certificate, address) {
  return openssl(['verify', '-CAfile', ca, '-purpose', 'sslserver', '-verify_ip', address, certificate]).status === 0;
}

function matchesKey(certificate, key, requireCa = false) {
  try {
    const parsed = new X509Certificate(readFileSync(certificate));
    return (!requireCa || parsed.ca) && parsed.checkPrivateKey(createPrivateKey(readFileSync(key)));
  } catch {
    return false;
  }
}

function installCertificates(address) {
  const ca = join(certDirectory, caName);
  const caKey = join(certDirectory, caKeyName);
  const cert = join(certDirectory, 'cert.pem');
  const key = join(certDirectory, 'key.pem');
  if (matchesKey(cert, key) && verifyCertificate(ca, cert, address)) {
    console.log('Reusing the existing development certificate.');
    return false;
  }

  const stage = mkdtempSync(join(tmpdir(), 'healthlink-android-'));
  const replacements = [];
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const generate = args => {
    const result = openssl(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', ...args]);
    if (result.status !== 0) throw new Error(result.stderr.trim().split(/\r?\n/).at(-1) || 'OpenSSL could not generate the certificate.');
  };

  try {
    let signingCert = ca;
    let signingKey = caKey;
    if (!matchesKey(ca, caKey, true) || openssl(['x509', '-in', ca, '-noout', '-checkend', '7776000']).status !== 0) {
      signingCert = join(stage, caName);
      signingKey = join(stage, caKeyName);
      generate(['-days', '365', '-subj', '/CN=HealthLink Local Dev CA',
        '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
        '-out', signingCert, '-keyout', signingKey]);
      replacements.push([signingCert, ca], [signingKey, caKey]);
    }

    const stagedCert = join(stage, 'cert.pem');
    const stagedKey = join(stage, 'key.pem');
    const ips = [...new Set([address, '127.0.0.1', '10.0.2.2'])];
    generate(['-days', '90', '-subj', '/CN=HealthLink Local API', '-CA', signingCert, '-CAkey', signingKey,
      '-addext', 'basicConstraints=critical,CA:FALSE', '-addext', 'extendedKeyUsage=serverAuth',
      '-addext', `subjectAltName=DNS:localhost,${ips.map(ip => `IP:${ip}`).join(',')}`,
      '-out', stagedCert, '-keyout', stagedKey]);
    if (!verifyCertificate(signingCert, stagedCert, address)) throw new Error('The new certificate failed verification.');
    replacements.push([stagedCert, cert], [stagedKey, key]);

    // Back up every existing destination before installing any replacement.
    const backups = replacements.map(([, target]) => {
      if (!existsSync(target)) return null;
      const backup = target.replace(/\.pem$/, `.before-android-dev-${stamp}.pem`);
      copyFileSync(target, backup);
      return backup;
    });
    try {
      for (const [source, target] of replacements) copyFileSync(source, target);
    } catch (error) {
      for (const [index, [, target]] of replacements.entries()) {
        if (backups[index]) copyFileSync(backups[index], target);
        else rmSync(target, { force: true });
      }
      throw error;
    }
    console.log('Installed the development certificate. Previous files were backed up if present.');
    return true;
  } finally {
    for (const name of [caName, caKeyName, 'cert.pem', 'key.pem']) rmSync(join(stage, name), { force: true });
    rmdirSync(stage);
  }
}

function ping(address, port, ca) {
  return new Promise((resolve, reject) => {
    const request = get({
      hostname: address === '10.0.2.2' ? '127.0.0.1' : address,
      port,
      path: '/api/ping',
      ca,
      timeout: 1500,
      checkServerIdentity: (_, certificate) => checkServerIdentity(address, certificate),
    }, response => {
      response.resume();
      if (response.statusCode === 200) resolve(true);
      else reject(new Error(`/api/ping returned HTTP ${response.statusCode}.`));
    });
    request.on('timeout', () => request.destroy(new Error('The HTTPS API did not respond.')));
    request.on('error', error => {
      if (error.code === 'ECONNREFUSED') resolve(false);
      else reject(error);
    });
  });
}

async function withCertificateLock(action) {
  mkdirSync(certDirectory, { recursive: true });
  const lockPath = join(certDirectory, '.android-dev.lock');
  let lock;
  try {
    lock = openSync(lockPath, 'wx');
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error('Another launcher is setting up development TLS. If it was interrupted, close it and remove server/certs/.android-dev.lock before retrying.');
  }

  try {
    return await action();
  } finally {
    closeSync(lock);
    rmSync(lockPath);
  }
}

function prepareApi(address, port) {
  return withCertificateLock(async () => {
    const caPath = join(certDirectory, caName);
    let ca = existsSync(caPath) ? readFileSync(caPath) : undefined;
    const running = await ping(address, port, ca).catch(error => {
      throw new Error(`The service on port ${port} failed the HTTPS check (${error.message}). Stop the existing service if it is your local API, then rerun this launcher.`);
    });
    if (running && ca) {
      console.log('Using the running HTTPS API.');
      return ca;
    }
    if (running) throw new Error('Stop the existing local API before setting up the development CA.');

    installCertificates(address);
    ca = readFileSync(caPath);
    const started = spawnSync('start "HealthLink API" cmd.exe /d /k npm.cmd run dev', {
      cwd: serverDirectory, shell: true, stdio: 'inherit',
    });
    if (started.error || started.status !== 0) throw new Error('Could not open the API window. Run npm run dev from server/ and retry.');

    console.log('Waiting for the HTTPS API...');
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (await ping(address, port, ca)) return ca;
      await delay(1000);
    }
    throw new Error('The API did not start within 60 seconds. Check the HealthLink API window for details.');
  });
}

async function run(args) {
  const certOnly = args[0] === '--cert-only';
  if (certOnly) args = args.slice(1);
  const launcher = certOnly ? 'run-android-cert.bat' : 'run-android-dev.bat';
  const usage = `Usage: ${launcher} [LAN IPv4 address | 10.0.2.2 for the Android emulator]`;
  if (args.length === 1 && ['--help', '-h', '/?'].includes(args[0])) {
    console.log(usage);
    return;
  }
  if (args.length > 1) throw new Error(usage);

  const requiredTools = certOnly ? ['openssl.exe'] : ['openssl.exe', 'npm.cmd', 'flutter.bat'];
  for (const tool of requiredTools) {
    if (spawnSync('where.exe', [tool], { stdio: 'ignore' }).status !== 0) throw new Error(`Add ${tool} to PATH.`);
  }
  if (certOnly) {
    const address = await chooseAddress(args[0]);
    const installed = await withCertificateLock(() => installCertificates(address));
    console.log(`Public development CA: server/certs/${caName}`);
    if (installed) console.log('If the local API is already running, restart it to load the new certificate.');
    return;
  }
  if (!existsSync(join(serverDirectory, 'node_modules', '.bin', 'nodemon.cmd'))) {
    throw new Error('Run npm install from server/ before using this launcher.');
  }

  const envPath = join(serverDirectory, '.env');
  const { parse } = createRequire(join(serverDirectory, 'package.json'))('dotenv');
  const env = existsSync(envPath) ? parse(readFileSync(envPath)) : {};
  const port = Number((process.env.PORT ?? env.PORT) || '5000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a TCP port from 1 to 65535.');

  const address = await chooseAddress(args[0]);
  const ca = await prepareApi(address, port);
  const origin = `https://${address}:${port}`;
  console.log(`Starting Flutter with ${origin}`);
  // These arguments contain only the validated IPv4 address, port, and Base64 certificate.
  const flutter = spawn(`flutter.bat run --debug --dart-define=API_BASE_URL=${origin} --dart-define=LOCAL_DEV_CA_BASE64=${ca.toString('base64')}`, {
    cwd: mobileDirectory, shell: true, stdio: 'inherit',
  });
  flutter.on('error', error => {
    console.error(error.message);
    process.exitCode = 1;
  });
  flutter.on('exit', code => { process.exitCode = code ?? 1; });
}

try {
  await run(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
