import importlib.util, io, json, tempfile, unittest, zipfile, hashlib
from pathlib import Path
MODULE=Path(__file__).resolve().parents[1]/'windows'/'update_from_github.py'
spec=importlib.util.spec_from_file_location('updater',MODULE)
u=importlib.util.module_from_spec(spec); spec.loader.exec_module(u)
class UpdateTests(unittest.TestCase):
 def setUp(self):
  self.dir=tempfile.TemporaryDirectory();self.root=Path(self.dir.name)
  p=self.root/'extension';p.mkdir();(p/'manifest.json').write_text('{"version":"1.4.0","manifest_version":3}')
  self.tag='v1.4.1'
  buf=io.BytesIO()
  with zipfile.ZipFile(buf,'w') as z:
   z.writestr('manifest.json','{"version":"1.4.1","manifest_version":3}')
   z.writestr('background.js','// vetted new version')
  self.zip=buf.getvalue()
  self.sums=(hashlib.sha256(self.zip).hexdigest()+'  work-ring-extension.zip\n').encode()
  prefix=f'https://github.com/{u.DEFAULT_REPO}/releases/download/{self.tag}/'
  self.assets={u.ZIP_NAME:prefix+u.ZIP_NAME,u.SUMS_NAME:prefix+u.SUMS_NAME}
 def tearDown(self):self.dir.cleanup()
 def fetch(self,url):
  if 'api.github.com' in url:
   return json.dumps({'tag_name':self.tag,'draft':False,'prerelease':False,'assets':[{'name':k,'browser_download_url':v} for k,v in self.assets.items()]}).encode()
  if url==self.assets[u.ZIP_NAME]:return self.zip
  if url==self.assets[u.SUMS_NAME]:return self.sums
  raise RuntimeError('Unexpected URL')
 def test_check_never_changes_files(self):
  s=u.run(u.DEFAULT_REPO,False,self.root,self.fetch)
  self.assertIn('Available update',s)
  self.assertEqual(u.installed_version(self.root/'extension'),(1,4,0))
 def test_install_and_rollback_backup(self):
  old_appdata=u.APPDATA
  try:
   u.APPDATA=self.root/'data'
   s=u.run(u.DEFAULT_REPO,True,self.root,self.fetch)
   self.assertIn('Installed v1.4.1',s)
   self.assertEqual(u.installed_version(self.root/'extension'),(1,4,1))
   self.assertEqual(json.loads((u.APPDATA/'installed_extension_version.json').read_text())['version'],'1.4.1')
   self.assertEqual(len(list(self.root.glob('work-ring-backup-*'))),1)
   self.assertIn('Already up to date',u.run(u.DEFAULT_REPO,True,self.root,self.fetch))
  finally:u.APPDATA=old_appdata
 def test_checksum_mismatch_blocks_update(self):
  def corrupt(url):return b'0'*64+b'  work-ring-extension.zip\n' if url==self.assets[u.SUMS_NAME] else self.fetch(url)
  with self.assertRaisesRegex(ValueError,'SHA256 mismatch'):u.run(u.DEFAULT_REPO,True,self.root,corrupt)
  self.assertEqual(u.installed_version(self.root/'extension'),(1,4,0))
 def test_archive_path_traversal_blocked(self):
  with tempfile.TemporaryDirectory() as d:
   z=Path(d)/'bad.zip';tar=Path(d)/'target'
   with zipfile.ZipFile(z,'w') as f:
    f.writestr('../evil.js','x');f.writestr('manifest.json','{"version":"1.4.1","manifest_version":3}')
   with self.assertRaisesRegex(ValueError,'Unsafe ZIP path'):u.validate_archive(z,'1.4.1',tar)
 def test_bad_release_url_rejected(self):
  self.assets[u.ZIP_NAME]='https://other.example/update.zip'
  with self.assertRaisesRegex(ValueError,'unexpected URL'):u.repo_release(u.DEFAULT_REPO,self.fetch)
 def test_older_tag_not_applied(self):
  self.tag='v1.3.9'
  prefix=f'https://github.com/{u.DEFAULT_REPO}/releases/download/{self.tag}/'
  self.assets={u.ZIP_NAME:prefix+u.ZIP_NAME,u.SUMS_NAME:prefix+u.SUMS_NAME}
  self.assertIn('Already up to date',u.run(u.DEFAULT_REPO,False,self.root,self.fetch))
if __name__=='__main__':unittest.main()
