s = open('docs/gitbook/style.css').read()
head = 'markdown-section code{'
color_attribute = 'color:#bf616a;'
s = s.replace(head, head + color_attribute)
with open('docs/gitbook/style.css', 'w') as f:
    f.write(s)

