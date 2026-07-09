import os
import re
import urllib.request
import zipfile
import json
import time

# Configurações de caminhos
WORKSPACE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS_DIR = os.path.join(WORKSPACE_DIR, "scripts")
TEMP_DIR = os.path.join(WORKSPACE_DIR, "temp_data")
OUTPUT_FILE = os.path.join(WORKSPACE_DIR, "words.js")

# URLs dos datasets
WORDS_URL = "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears.txt"
TATOEBA_URL = "http://www.manythings.org/anki/por-eng.zip"

def setup_dirs():
    os.makedirs(TEMP_DIR, exist_ok=True)
    os.makedirs(SCRIPTS_DIR, exist_ok=True)

def download_file(url, filepath):
    print(f"Baixando: {url} -> {filepath}")
    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    )
    with urllib.request.urlopen(req) as response, open(filepath, 'wb') as out_file:
        out_file.write(response.read())
    print("Download concluído!")

def extract_zip(zip_path, extract_to):
    print(f"Extraindo: {zip_path} -> {extract_to}")
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(extract_to)
    print("Extração concluída!")

def get_english_words():
    words_file = os.path.join(TEMP_DIR, "common_words.txt")
    if not os.path.exists(words_file):
        download_file(WORDS_URL, words_file)
    
    with open(words_file, "r", encoding="utf-8") as f:
        words = [line.strip() for line in f if line.strip()]
    
    # Retorna apenas as primeiras 1000 palavras
    return words[:1000]

def parse_tatoeba_sentences():
    zip_path = os.path.join(TEMP_DIR, "por-eng.zip")
    txt_path = os.path.join(TEMP_DIR, "por.txt")
    
    if not os.path.exists(txt_path):
        if not os.path.exists(zip_path):
            download_file(TATOEBA_URL, zip_path)
        extract_zip(zip_path, TEMP_DIR)
        
    print("Processando sentenças do Tatoeba...")
    sentence_pairs = []
    with open(txt_path, "r", encoding="utf-8") as f:
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) >= 2:
                eng_sentence = parts[0].strip()
                por_sentence = parts[1].strip()
                sentence_pairs.append((eng_sentence, por_sentence))
                
    print(f"Total de {len(sentence_pairs)} pares de sentenças carregados.")
    return sentence_pairs

def index_sentence_pairs(sentence_pairs):
    print("Criando índice de palavras para as sentenças...")
    word_index = {}
    for idx, (eng, por) in enumerate(sentence_pairs):
        # Filtros de qualidade rápidos
        if len(eng) < 12 or len(eng) > 80:
            continue
        if "http" in eng or "@" in eng:
            continue
        # Tokenizar por limite de palavra (apenas letras/números)
        tokens = set(re.findall(r'\b\w+\b', eng.lower()))
        for token in tokens:
            if token not in word_index:
                word_index[token] = []
            word_index[token].append(idx)
    return word_index

def find_best_sentence(word, sentence_pairs, word_index):
    # Procura a frase mais curta que contém a palavra exata usando o índice
    word_lower = word.lower()
    best_pair = None
    min_len = float('inf')
    
    indices = word_index.get(word_lower, [])
    for idx in indices:
        eng, por = sentence_pairs[idx]
        if len(eng) < min_len:
            min_len = len(eng)
            best_pair = (eng, por)
            
    # Fallback caso não ache com correspondência exata de limite de palavra no índice
    if not best_pair:
        pattern = re.compile(rf"\b{re.escape(word)}\b", re.IGNORECASE)
        for eng, por in sentence_pairs:
            if len(eng) < 12 or len(eng) > 80:
                continue
            if "http" in eng or "@" in eng:
                continue
            if pattern.search(eng):
                if len(eng) < min_len:
                    min_len = len(eng)
                    best_pair = (eng, por)
                    
    # Fallback final se nada for encontrado (extremamente raro para as 1000 palavras mais comuns)
    if not best_pair:
        best_pair = (f"This is a sentence containing the word {word}.", f"Esta é uma frase contendo a palavra {word}.")
        
    return best_pair

def translate_words_batch(words_list):
    print("Instalando/importando deep-translator...")
    try:
        from deep_translator import GoogleTranslator
    except ImportError:
        print("Instalando a biblioteca deep-translator...")
        import subprocess
        subprocess.check_call(["pip", "install", "deep-translator"])
        from deep_translator import GoogleTranslator
        
    translator = GoogleTranslator(source='en', target='pt')
    
    print(f"Traduzindo {len(words_list)} palavras em lotes...")
    translations = []
    batch_size = 100
    
    for i in range(0, len(words_list), batch_size):
        batch = words_list[i:i+batch_size]
        print(f"Processando lote de tradução {i // batch_size + 1} de {len(words_list) // batch_size}...")
        try:
            batch_trans = translator.translate_batch(batch)
            translations.extend(batch_trans)
        except Exception as e:
            print(f"Erro na tradução em lote: {e}. Tentando individualmente...")
            for w in batch:
                try:
                    translations.append(translator.translate(w))
                except Exception as ex:
                    print(f"Erro ao traduzir '{w}': {ex}")
                    translations.append(w) # Fallback para o próprio termo
        time.sleep(0.5) # Pequeno atraso amigável
        
    return translations

def main():
    start_time = time.time()
    setup_dirs()
    
    try:
        english_words = get_english_words()
        print(f"Carregadas {len(english_words)} palavras mais comuns do inglês.")
        
        sentence_pairs = parse_tatoeba_sentences()
        word_index = index_sentence_pairs(sentence_pairs)
        
        # Traduzir as palavras
        translations = translate_words_batch(english_words)
        
        # Combinar tudo
        print("Montando o banco de dados final...")
        db_entries = []
        for i, word in enumerate(english_words):
            trans = translations[i].lower()
            # Limpar traduções (remover pontuações, etc.)
            trans = trans.strip(".?,! ")
            
            eng_sentence, por_sentence = find_best_sentence(word, sentence_pairs, word_index)
            
            db_entries.append({
                "id": i + 1,
                "word": word,
                "translation": trans,
                "example": eng_sentence,
                "exampleTranslation": por_sentence
            })
            
        print(f"Salvando o banco de dados em {OUTPUT_FILE}...")
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            f.write("// Banco de dados das 1000 palavras mais comuns do inglês\n")
            f.write("// Gerado automaticamente via scripts/build_word_db.py\n\n")
            f.write("export const words = ")
            json.dump(db_entries, f, ensure_ascii=False, indent=2)
            f.write(";\n")
            
        print(f"Sucesso! Geradas {len(db_entries)} palavras com sucesso em {time.time() - start_time:.2f}s!")
        
    except Exception as e:
        print(f"Ocorreu um erro no processo: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
