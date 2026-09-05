#!/usr/bin/env python3

import spacy
nlp = spacy.load("en_core_web_sm")
doc = nlp("Hello, this is a test.")
print([token.text for token in doc])
