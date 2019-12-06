gitbook install
\cp prism-riscv.js node_modules/prismjs/components/
python3 add_riscv_component.py
rm -r docs/
gitbook build
mv _book/ docs/
python3 add_code_style.py
