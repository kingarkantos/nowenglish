import os
import re
import urllib.request
import urllib.parse
import zipfile
import json
import time

# Configurações de caminhos
WORKSPACE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMP_DIR = os.path.join(WORKSPACE_DIR, "temp_data")
OUTPUT_FILE = os.path.join(WORKSPACE_DIR, "words.js")

# URLs dos datasets
WORDS_URL = "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears.txt"
TATOEBA_URL = "http://www.manythings.org/anki/por-eng.zip"

# Dicionário de Citações Famosas (Filmes e Músicas) para as palavras mais comuns
FAMOUS_QUOTES = {
    "the": [
        {"eng": "May the Force be with you.", "por": "Que a Força esteja com você.", "source": "Star Wars (Filme)"},
        {"eng": "I am the law.", "por": "Eu sou a lei.", "source": "Judge Dredd (Filme)"},
        {"eng": "We are the champions.", "por": "Nós somos os campeões.", "source": "Queen (Música)"}
    ],
    "of": [
        {"eng": "The Lord of the Rings.", "por": "O Senhor dos Anéis.", "source": "Lord of the Rings (Filme)"},
        {"eng": "Nothing compares to you, out of all things.", "por": "Nada se compara a você, de todas as coisas.", "source": "Sinead O'Connor (Música)"},
        {"eng": "I'm sick of this.", "por": "Estou cansado disso.", "source": "The Matrix (Filme)"}
    ],
    "and": [
        {"eng": "Beauty and the Beast.", "por": "A Bela e a Fera.", "source": "Beauty and the Beast (Filme)"},
        {"eng": "War and peace.", "por": "Guerra e paz.", "source": "War and Peace (Filme)"},
        {"eng": "Come and get it.", "por": "Venha buscar / Venha pegar.", "source": "Selena Gomez (Música)"}
    ],
    "to": [
        {"eng": "To be, or not to be.", "por": "Ser ou não ser.", "source": "Hamlet (Filme)"},
        {"eng": "Welcome to the jungle.", "por": "Bem-vindo à selva.", "source": "Guns N' Roses (Música)"},
        {"eng": "Fly me to the moon.", "por": "Leve-me voando até a lua.", "source": "Frank Sinatra (Música)"}
    ],
    "a": [
        {"eng": "A whole new world.", "por": "Um mundo totalmente novo.", "source": "Aladdin (Filme)"},
        {"eng": "Like a rolling stone.", "por": "Como uma pedra rolando.", "source": "Bob Dylan (Música)"},
        {"eng": "It's a trap!", "por": "É uma armadilha!", "source": "Star Wars: Return of the Jedi (Filme)"}
    ],
    "in": [
        {"eng": "In the end, it doesn't even matter.", "por": "No fim, isso nem importa.", "source": "Linkin Park (Música)"},
        {"eng": "I believe in you.", "por": "Eu acredito em você.", "source": "Celine Dion (Música)"},
        {"eng": "Lost in translation.", "por": "Perdido na tradução.", "source": "Lost in Translation (Filme)"}
    ],
    "for": [
        {"eng": "Run, Forrest, run!", "por": "Corra, Forrest, corra!", "source": "Forrest Gump (Filme)"},
        {"eng": "Waiting for tonight.", "por": "Esperando por esta noite.", "source": "Jennifer Lopez (Música)"},
        {"eng": "Knockin' on heaven's door.", "por": "Batendo na porta do céu.", "source": "Bob Dylan (Música)"}
    ],
    "is": [
        {"eng": "All you need is love.", "por": "Tudo o que você precisa é amor.", "source": "The Beatles (Música)"},
        {"eng": "Life is like a box of chocolates.", "por": "A vida é como uma caixa de chocolates.", "source": "Forrest Gump (Filme)"},
        {"eng": "Is this love that I'm feeling?", "por": "Isso é amor o que estou sentindo?", "source": "Whitesnake (Música)"}
    ],
    "on": [
        {"eng": "Shine on you crazy diamond.", "por": "Brilhe, seu diamante louco.", "source": "Pink Floyd (Música)"},
        {"eng": "Hold on to your dreams.", "por": "Apegue-se aos seus sonhos.", "source": "Bon Jovi (Música)"},
        {"eng": "Go ahead, make my day.", "por": "Vá em frente, alegre o meu dia.", "source": "Dirty Harry (Filme)"}
    ],
    "that": [
        {"eng": "Show me the money! I need that.", "por": "Mostre-me o dinheiro! Eu preciso disso.", "source": "Jerry Maguire (Filme)"},
        {"eng": "I want it that way.", "por": "Eu quero desse jeito.", "source": "Backstreet Boys (Música)"},
        {"eng": "That's all, folks!", "por": "Isso é tudo, pessoal!", "source": "Looney Tunes (Desenho/Filme)"}
    ],
    "with": [
        {"eng": "May the Force be with you.", "por": "Que a Força esteja com você.", "source": "Star Wars (Filme)"},
        {"eng": "With or without you.", "por": "Com ou sem você.", "source": "U2 (Música)"},
        {"eng": "Dance with me.", "por": "Dance comigo.", "source": "Michael Jackson (Música)"}
    ],
    "i": [
        {"eng": "I will always love you.", "por": "Eu sempre amarei você.", "source": "Whitney Houston (Música)"},
        {"eng": "I'll be back.", "por": "Eu voltarei.", "source": "The Terminator (Filme)"},
        {"eng": "I want to break free.", "por": "Eu quero me libertar.", "source": "Queen (Música)"}
    ],
    "you": [
        {"eng": "You had me at hello.", "por": "Você me conquistou no 'olá'.", "source": "Jerry Maguire (Filme)"},
        {"eng": "You raise me up.", "por": "Você me eleva.", "source": "Josh Groban (Música)"},
        {"eng": "You are not alone.", "por": "Você não está sozinho.", "source": "Michael Jackson (Música)"}
    ],
    "it": [
        {"eng": "Let it be.", "por": "Deixe estar / Deixe ser.", "source": "The Beatles (Música)"},
        {"eng": "It's alive! It's alive!", "por": "Está vivo! Está vivo!", "source": "Frankenstein (Filme)"},
        {"eng": "Don't stop it.", "por": "Não pare isso.", "source": "Fleetwood Mac (Música)"}
    ],
    "not": [
        {"eng": "I am not your servant.", "por": "Eu não sou seu servo.", "source": "Gladiator (Filme)"},
        {"eng": "We're not gonna take it.", "por": "Nós não vamos aceitar isso.", "source": "Twisted Sister (Música)"},
        {"eng": "Not all who wander are lost.", "por": "Nem todos os que vagam estão perdidos.", "source": "J.R.R. Tolkien (Livro/Filme)"}
    ],
    "be": [
        {"eng": "To be or not to be.", "por": "Ser ou não ser.", "source": "Hamlet (Filme)"},
        {"eng": "Be my baby.", "por": "Seja meu amor / meu bebê.", "source": "The Ronettes (Música)"},
        {"eng": "Don't worry, be happy.", "por": "Não se preocupe, seja feliz.", "source": "Bobby McFerrin (Música)"}
    ],
    "are": [
        {"eng": "We are the champions.", "por": "Nós somos os campeões.", "source": "Queen (Música)"},
        {"eng": "You are the one.", "por": "Você é a única / o único.", "source": "The Matrix (Filme)"},
        {"eng": "Are you talking to me?", "por": "Você está falando comigo?", "source": "Taxi Driver (Filme)"}
    ],
    "have": [
        {"eng": "I have a dream.", "por": "Eu tenho um sonho.", "source": "Martin Luther King (Discurso)"},
        {"eng": "Have you ever seen the rain?", "por": "Você já viu a chuva?", "source": "Creedence Clearwater Revival (Música)"},
        {"eng": "I have to go.", "por": "Eu tenho que ir.", "source": "The Lion King (Filme)"}
    ],
    "new": [
        {"eng": "A whole new world.", "por": "Um mundo totalmente novo.", "source": "Aladdin (Filme)"},
        {"eng": "New York, New York.", "por": "Nova Iorque, Nova Iorque.", "source": "Frank Sinatra (Música)"},
        {"eng": "A new hope.", "por": "Uma nova esperança.", "source": "Star Wars (Filme)"}
    ],
    "can": [
        {"eng": "Yes, we can.", "por": "Sim, nós podemos.", "source": "Barack Obama (Discurso)"},
        {"eng": "Can you feel the love tonight?", "por": "Você consegue sentir o amor esta noite?", "source": "Elton John (Música/Rei Leão)"},
        {"eng": "I can see clearly now.", "por": "Eu consigo ver claramente agora.", "source": "Jimmy Cliff (Música)"}
    ]
}

def setup_dirs():
    os.makedirs(TEMP_DIR, exist_ok=True)

def download_file(url, filepath):
    print(f"Baixando: {url} -> {filepath}", flush=True)
    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': 'Mozilla/5.0'
        }
    )
    with urllib.request.urlopen(req, timeout=10) as response, open(filepath, 'wb') as out_file:
        out_file.write(response.read())
    print("Download concluído!", flush=True)

def extract_zip(zip_path, extract_to):
    print(f"Extraindo: {zip_path} -> {extract_to}", flush=True)
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(extract_to)
    print("Extração concluída!", flush=True)

def get_english_words():
    words_file = os.path.join(TEMP_DIR, "common_words.txt")
    if not os.path.exists(words_file):
        download_file(WORDS_URL, words_file)
    
    with open(words_file, "r", encoding="utf-8") as f:
        words = [line.strip() for line in f if line.strip()]
    
    return words[:1000]

def parse_tatoeba_sentences():
    zip_path = os.path.join(TEMP_DIR, "por-eng.zip")
    txt_path = os.path.join(TEMP_DIR, "por.txt")
    
    if not os.path.exists(txt_path):
        if not os.path.exists(zip_path):
            download_file(TATOEBA_URL, zip_path)
        extract_zip(zip_path, TEMP_DIR)
        
    print("Processando sentenças do Tatoeba...", flush=True)
    sentence_pairs = []
    with open(txt_path, "r", encoding="utf-8") as f:
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) >= 2:
                eng_sentence = parts[0].strip()
                por_sentence = parts[1].strip()
                sentence_pairs.append((eng_sentence, por_sentence))
                
    print(f"Total de {len(sentence_pairs)} pares de sentenças carregados.", flush=True)
    return sentence_pairs

def index_sentence_pairs(sentence_pairs):
    print("Criando índice de palavras para as sentenças...", flush=True)
    word_index = {}
    for idx, (eng, por) in enumerate(sentence_pairs):
        if len(eng) < 12 or len(eng) > 80:
            continue
        if "http" in eng or "@" in eng:
            continue
        tokens = set(re.findall(r'\b\w+\b', eng.lower()))
        for token in tokens:
            if token not in word_index:
                word_index[token] = []
            word_index[token].append(idx)
    return word_index

def find_best_sentences(word, sentence_pairs, word_index, count=3):
    word_lower = word.lower()
    matches = []
    
    indices = word_index.get(word_lower, [])
    for idx in indices:
        eng, por = sentence_pairs[idx]
        matches.append((len(eng), eng, por))
        
    matches.sort()
    
    seen = set()
    unique_matches = []
    for length, eng, por in matches:
        if eng.lower() not in seen:
            seen.add(eng.lower())
            unique_matches.append((eng, por))
            if len(unique_matches) >= count:
                break
                
    if len(unique_matches) < count:
        pattern = re.compile(rf"\b{re.escape(word)}\b", re.IGNORECASE)
        for eng, por in sentence_pairs:
            if len(eng) < 12 or len(eng) > 80:
                continue
            if pattern.search(eng) and eng.lower() not in seen:
                seen.add(eng.lower())
                unique_matches.append((eng, por))
                if len(unique_matches) >= count:
                    break
                    
    while len(unique_matches) < count:
        unique_matches.append((
            f"This is a sentence containing the word {word}.",
            f"Esta é uma frase contendo a palavra {word}."
        ))
        
    return [{"eng": eng, "por": por} for eng, por in unique_matches]

def fetch_translations(word):
    url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt&dt=t&dt=bd&q={urllib.parse.quote(word)}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0"}
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode("utf-8"))
            main_trans = data[0][0][0].strip().lower()
            
            synonyms = []
            if len(data) > 1 and data[1] is not None:
                for item in data[1]:
                    if len(item) > 1 and isinstance(item[1], list):
                        synonyms.extend(item[1])
            
            unique_trans = []
            seen = set()
            for t in [main_trans] + synonyms:
                t_clean = t.strip().lower()
                if t_clean not in seen and len(t_clean) > 0:
                    seen.add(t_clean)
                    unique_trans.append(t_clean)
                    
            return ", ".join(unique_trans[:4])
    except Exception as e:
        print(f"Erro ao traduzir {word}: {e}", flush=True)
        return None

def load_existing_database():
    if not os.path.exists(OUTPUT_FILE):
        return {}
    try:
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            content = f.read()
            match = re.search(r"export\s+const\s+words\s*=\s*(\[[\s\S]*?\])\s*;", content)
            if match:
                parsed_list = json.loads(match.group(1))
                return {item["word"].lower(): item for item in parsed_list}
    except Exception as e:
        print(f"Erro ao carregar banco de dados existente: {e}", flush=True)
    return {}

def main():
    start_time = time.time()
    setup_dirs()
    
    try:
        english_words = get_english_words()
        print(f"Carregadas {len(english_words)} palavras mais comuns do inglês.", flush=True)
        
        sentence_pairs = parse_tatoeba_sentences()
        word_index = index_sentence_pairs(sentence_pairs)
        
        existing_db = load_existing_database()
        print(f"Carregadas {len(existing_db)} traduções existentes do cache local.", flush=True)
        
        print("Buscando traduções e frases de exemplo...", flush=True)
        db_entries = []
        for i, word in enumerate(english_words):
            word_lower = word.lower()
            
            # Decide se busca nova tradução ou usa cache existente
            # Traduzimos individualmente apenas as primeiras 150 palavras (mais ambíguas) para pegar sinônimos novos
            # Para as demais, usamos o cache pré-existente ou traduzimos apenas em caso de falha do cache.
            trans = None
            if i < 150:
                trans = fetch_translations(word)
                if not trans and word_lower in existing_db:
                    trans = existing_db[word_lower]["translation"]
            else:
                if word_lower in existing_db:
                    trans = existing_db[word_lower]["translation"]
                else:
                    trans = fetch_translations(word)
            
            if not trans:
                trans = word # Fallback final
            
            # Obtém citações famosas ou do Tatoeba
            if word_lower in FAMOUS_QUOTES:
                examples_list = FAMOUS_QUOTES[word_lower]
            else:
                examples_list = find_best_sentences(word, sentence_pairs, word_index)
                
            primary_example = examples_list[0]["eng"]
            primary_example_trans = examples_list[0]["por"]
            
            db_entries.append({
                "id": i + 1,
                "word": word,
                "translation": trans,
                "example": primary_example,
                "exampleTranslation": primary_example_trans,
                "examples": examples_list
            })
            
            if (i + 1) % 50 == 0:
                print(f"Processadas {i + 1}/1000 palavras...", flush=True)
                time.sleep(0.05)
            
        print(f"Salvando o banco de dados em {OUTPUT_FILE}...", flush=True)
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            f.write("// Banco de dados das 1000 palavras mais comuns do inglês\n")
            f.write("// Gerado automaticamente via scripts/build_word_db.py\n\n")
            f.write("export const words = ")
            json.dump(db_entries, f, ensure_ascii=False, indent=2)
            f.write(";\n")
            
        print(f"Sucesso! Geradas {len(db_entries)} palavras enriquecidas em {time.time() - start_time:.2f}s!", flush=True)
        
    except Exception as e:
        print(f"Ocorreu um erro no processo: {e}", flush=True)
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
