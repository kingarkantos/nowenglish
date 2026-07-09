import os
import sys
import time

DB_HOST = "db.czympfukmtglynkuyybe.supabase.co"
DB_PORT = "5432"
DB_NAME = "postgres"
DB_USER = "postgres"
DB_PASS = "@Mnhbjb246580"

def install_and_import():
    try:
        import psycopg2
    except ImportError:
        print("Instalando a biblioteca psycopg2-binary para conexão com PostgreSQL...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "psycopg2-binary"])
        import psycopg2
    return psycopg2

def main():
    psycopg2 = install_and_import()
    
    sql_script = """
    -- Habilita extensão uuid se não existir
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    -- Tabela de usuários (para controle anônimo)
    CREATE TABLE IF NOT EXISTS nowenglish_users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
    );

    -- Tabela de progresso
    CREATE TABLE IF NOT EXISTS nowenglish_progress (
        user_id UUID PRIMARY KEY REFERENCES nowenglish_users(id) ON DELETE CASCADE,
        max_unlocked_day INTEGER DEFAULT 1 NOT NULL,
        last_completed_day INTEGER DEFAULT 0 NOT NULL,
        streak INTEGER DEFAULT 0 NOT NULL,
        last_active_date TEXT,
        score_history JSONB DEFAULT '{}'::jsonb NOT NULL,
        struggled_words JSONB DEFAULT '[]'::jsonb NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
    );

    -- Ativar RLS (Row Level Security)
    ALTER TABLE nowenglish_users ENABLE ROW LEVEL SECURITY;
    ALTER TABLE nowenglish_progress ENABLE ROW LEVEL SECURITY;

    -- Remover políticas antigas para evitar erros de duplicidade
    DROP POLICY IF EXISTS "Allow anon inserts on users" ON nowenglish_users;
    DROP POLICY IF EXISTS "Allow anon selects on users" ON nowenglish_users;
    DROP POLICY IF EXISTS "Allow anon inserts on progress" ON nowenglish_progress;
    DROP POLICY IF EXISTS "Allow anon selects on progress" ON nowenglish_progress;
    DROP POLICY IF EXISTS "Allow anon updates on progress" ON nowenglish_progress;

    -- Criar políticas para o papel 'anon' (cliente anônimo da API)
    CREATE POLICY "Allow anon inserts on users" ON nowenglish_users FOR INSERT TO anon WITH CHECK (true);
    CREATE POLICY "Allow anon selects on users" ON nowenglish_users FOR SELECT TO anon USING (true);
    CREATE POLICY "Allow anon inserts on progress" ON nowenglish_progress FOR INSERT TO anon WITH CHECK (true);
    CREATE POLICY "Allow anon selects on progress" ON nowenglish_progress FOR SELECT TO anon USING (true);
    CREATE POLICY "Allow anon updates on progress" ON nowenglish_progress FOR UPDATE TO anon USING (true) WITH CHECK (true);
    """
    
    print(f"Conectando ao banco de dados Supabase em {DB_HOST}...")
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASS
        )
        conn.autocommit = True
        cursor = conn.cursor()
        
        print("Executando script SQL para criação das tabelas e políticas de RLS...")
        cursor.execute(sql_script)
        
        print("Tabelas criadas com sucesso!")
        
        # Verificar tabelas criadas
        cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'nowenglish_%';")
        tables = cursor.fetchall()
        print(f"Tabelas no banco de dados: {[t[0] for t in tables]}")
        
        cursor.close()
        conn.close()
        print("Configuração do Supabase finalizada com sucesso!")
        
    except Exception as e:
        print(f"Erro ao conectar ou executar no Supabase: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
