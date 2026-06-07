import { spawn } from 'node:child_process';
import process from 'node:process';

const isWindows = process.platform === 'win32';

function run(command, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n> ${[command, ...args].join(' ')}`);
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: isWindows,
    });

    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}

async function main() {
  await run('node', ['tools/check_fixed_layout_sources.mjs']);
  await run('node', ['tools/validate_fixed_layout_geometry.mjs']);
  await run('node', ['tools/export_fixed_layout_images.mjs']);
  await run('node', ['tools/prepare_kindle_pages.mjs']);
  await run('python', ['tools/build_fixed_layout_epub.py']);
  await run('python', ['tools/check_fixed_layout_outputs.py']);

  console.log('\nfixed layout build complete.');
}

main().catch(error => {
  console.error('\nfixed layout build failed.');
  console.error(error.message);
  process.exit(1);
});
