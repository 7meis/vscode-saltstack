#!py
import os

def run():
    grains = {'id': 'minion-01'}
    return grains['id'] if os.environ.get('SALT_ENV') else 'unknown'