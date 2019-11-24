s = open('docs/gitbook/style.css').read()
code = 'markdown-section code{'
color_red = 'color:#bf616a;'
code_in_pre = 'markdown-section pre>code{'
color_inherit = 'color:#ccc;'
s = s.replace(code, code + color_red)
s = s.replace(code_in_pre, code_in_pre + color_inherit)
with open('docs/gitbook/style.css', 'w') as f:
    f.write(s)

