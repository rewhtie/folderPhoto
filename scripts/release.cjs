// 打包 + 询问是否上传到 GitHub Releases（打包日期作为 tag，不再用版本号）
// 用法: npm run release
// 只上传、不打包的独立指令见 scripts/upload.cjs（npm run upload）
const {
  ROOT, buildDate, productName, tauriNsisDirectory, run, ask, ensureToken, parseRemote,
  listExes, findOrCreateRelease, uploadFiles,
} = require('./_shared.cjs');

(async () => {
  const date = buildDate();

  console.log(`==> 步骤 1/3：打包 Tauri NSIS 安装包（日期标记 ${date}）\n`);
  await run('npm', ['run', 'build'], { cwd: ROOT });

  const distDir = tauriNsisDirectory();
  const exes = listExes(distDir);
  if (exes.length === 0) {
    throw new Error('未在 Tauri NSIS 产物目录找到 .exe 安装包，请检查打包是否成功。');
  }
  console.log('\n打包产物：');
  exes.forEach((f) => console.log('  - ' + f));
  console.log('');

  const doUpload = await ask('是否上传到 GitHub Releases？', 'y');
  if (!/^y/i.test(doUpload)) {
    console.log('已跳过上传。');
    return;
  }

  const token = await ensureToken();
  if (!token) {
    throw new Error('未提供 Token。');
  }

  const remote = parseRemote() || { owner: 'rewhtie', repo: 'folderPhoto' };
  const tag = date; // 用打包日期作为 release tag，不再用版本号
  const notes = await ask('发布说明', `${productName()} ${date}`);

  console.log(`\n==> 步骤 2/3：创建/查找 Release（tag = ${tag}）\n`);
  const release = await findOrCreateRelease(token, remote.owner, remote.repo, tag, notes);

  console.log('\n==> 步骤 3/3：上传安装包\n');
  await uploadFiles(token, release, exes);

  console.log(`\n完成！https://github.com/${remote.owner}/${remote.repo}/releases/tag/${tag}`);
})().catch((e) => {
  console.error('\n出错：', e.message);
  process.exitCode = 1;
});