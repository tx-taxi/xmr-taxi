#!/usr/bin/env python3
"""Report XLIFF coverage without treating copied English or broken placeholders as translations.

Supply a fresh Angular extract as --source for active-message coverage. The default
Spanish catalog is a historical superset and can include inactive messages.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
LOCALE = ROOT / 'frontend/src/locale'
NS = {'x': 'urn:oasis:names:tc:xliff:document:1.2'}
X = '{urn:oasis:names:tc:xliff:document:1.2}'

def read_units(path):
    return {u.attrib['id']: u for u in ET.parse(path).findall('.//x:trans-unit', NS)}

def text(element):
    return ''.join(element.itertext()).strip() if element is not None else ''

def placeholders(element):
    if element is None:
        return Counter()
    return Counter(e.attrib.get('id', '') for e in element.iter() if e.tag == X + 'x')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=LOCALE / 'messages.es.xlf')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    source = read_units(args.source)
    config = json.loads((ROOT / 'frontend/angular.json').read_text())
    locales = config['projects']['mempool']['i18n']['locales']
    report = {'source': str(args.source), 'source_units': len(source), 'source_kind': 'catalog_superset' if args.source.resolve() == (LOCALE / 'messages.es.xlf').resolve() else 'provided_extract', 'locales': {}}
    for locale, definition in locales.items():
        path = ROOT / 'frontend' / definition['translation']
        target = read_units(path)
        missing, empty, broken, unchanged, stale_source = [], [], [], [], []
        for key, source_unit in source.items():
            original = source_unit.find('x:source', NS)
            if not text(original):
                continue
            item = target.get(key)
            if item is None:
                missing.append(key)
                continue
            catalog_source = item.find('x:source', NS)
            if text(catalog_source) != text(original) or placeholders(catalog_source) != placeholders(original):
                stale_source.append(key)
            translation = item.find('x:target', NS)
            if not text(translation) and not placeholders(translation):
                empty.append(key)
                continue
            if placeholders(original) != placeholders(translation):
                broken.append({'id': key, 'expected': dict(placeholders(original)), 'found': dict(placeholders(translation))})
            if text(original) == text(translation):
                unchanged.append(key)
        report['locales'][locale] = {'missing': missing, 'empty': empty, 'broken_placeholders': broken, 'unchanged_review': unchanged, 'stale_source_review': stale_source}
    output = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.write_text(output)
    else:
        print(output, end='')

if __name__ == '__main__':
    main()
