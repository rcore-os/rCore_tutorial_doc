# gitbook install
cp extensions/highlight/prism-riscv.js node_modules/prismjs/components/
python3 extensions/highlight/add_riscv_component.py
rm -rf docs/
gitbook build
mv _book/ docs/
python3 extensions/highlight/add_code_style.py
