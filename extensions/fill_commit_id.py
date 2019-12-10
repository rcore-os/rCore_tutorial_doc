from posix import system

BASE_URL = 'https://github.com/rcore-os/rCore_tutorial/tree/'

for line in open('commit_ids.txt').readlines():
    path, commit_id = line[:-1].split(': ')
    path = path + '.md'
    find = r'^\[CODE\].*'
    replace = '[CODE]: {}{}'.format(BASE_URL, commit_id)
    system("sed -i '' -E 's#{}#{}#g' {}".format(find, replace, path))
