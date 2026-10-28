import re
import os
import sys

def extract_from_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    elements = []
    # Padrões para busca de elementos interativos e handlers
    patterns = [
        (r'<Button[^>]*>', 'Button'),
        (r'<button[^>]*>', 'button'),
        (r'<Link[^>]*>', 'Link'),
        (r'<TabsTrigger[^>]*>', 'TabsTrigger'),
        (r'<DialogTrigger[^>]*>', 'DialogTrigger'),
        (r'<AlertDialogAction[^>]*>', 'AlertDialogAction'),
        (r'<AlertDialogCancel[^>]*>', 'AlertDialogCancel'),
        (r'<DropdownMenuItem[^>]*>', 'DropdownMenuItem'),
        (r'<Checkbox[^>]*>', 'Checkbox'),
        (r'<Switch[^>]*>', 'Switch'),
        (r'<Select[^>]*>', 'Select'),
        (r'<Input[^>]*>', 'Input'),
        (r'<textarea[^>]*>', 'textarea'),
        (r'<form[^>]*>', 'form'),
        (r'onClick={[^}]*}', 'onClick'),
        (r'onSubmit={[^}]*}', 'onSubmit'),
        (r'onChange={[^}]*}', 'onChange'),
        (r'onCheckedChange={[^}]*}', 'onCheckedChange'),
        (r'onValueChange={[^}]*}', 'onValueChange')
    ]
    
    for pattern, label in patterns:
        matches = re.finditer(pattern, content)
        for m in matches:
            elements.append({'file': filepath, 'type': label, 'match': m.group(0)})
            
    return elements

all_elements = []
target_dirs = ['src/routes', 'src/components', 'src/routes/_admin/tabs']
for d in target_dirs:
    for root, _, files in os.walk(d):
        for file in files:
            if file.endswith('.tsx'):
                all_elements.extend(extract_from_file(os.path.join(root, file)))

print(f"Total elements found: {len(all_elements)}")
for el in all_elements:
    print(f"{el['file']}|{el['type']}|{el['match'][:50]}")
