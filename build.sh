gitbook install
cp extensions/highlight/prism-riscv.js node_modules/prismjs/components/
python3 extensions/highlight/add_riscv_component.py
rm -rf docs/
# git filter-branch --force --index-filter 'git rm --cached -r --ignore-unmatch docs' --prune-empty --tag-name-filter cat -- --all
gitbook build
mv _book/ docs/
python3 extensions/highlight/add_code_style.py
# git add docs
# git commit -m "update html"
# git push origin master:master --tags --force
