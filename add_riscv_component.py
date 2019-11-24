import json

json_path = 'node_modules/prismjs/components.json'

data = json.load(open(json_path))
data['languages']['riscv'] = {'title': 'RISC-V', 'owner': 'shinbokuow2'}
with open(json_path, 'w') as f:
    f.write(json.dumps(data, sort_keys = True, indent = 4))
