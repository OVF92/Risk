import yfinance as yf
import pandas as pd
import os
from supabase import create_client
from dotenv import load_dotenv # Indispensable pour ton PC local

def sync():
    # 1. Chargement des variables d'environnement
    # On cherche le .env.local dans le dossier Risk
    env_path = os.path.join(os.path.dirname(__file__), '..', 'Risk', '.env.local')
    if os.path.exists(env_path):
        load_dotenv(env_path)
        print("🏠 Mode local détecté : Clés chargées depuis .env.local")

    # Gestion hybride des noms de variables (Local vs GitHub Actions)
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")

    if not url or not key:
        print("❌ Erreur : URL ou Clé Supabase introuvable. Vérifie tes Secrets ou ton .env.local")
        return

    supabase = create_client(url, key)

    # 2. Récupération DYNAMIQUE des tickers
    print("🔍 Récupération de la liste des assets depuis Supabase...")
    try:
        response = supabase.table("Financial_Data").select("asset_symbol, asset_name, asset_currency").execute()
        
        # Création d'un dictionnaire pour mapper les infos par symbole
        assets_to_update = {item['asset_symbol']: item for item in response.data}
        tickers = list(assets_to_update.keys())
    except Exception as e:
        print(f"❌ Erreur lors de la lecture de la table : {e}")
        return

    if not tickers:
        print("⚠️ Aucun ticker trouvé dans la table Financial_Data.")
        return

    # 3. Téléchargement Yahoo Finance
    print(f"📥 Téléchargement de {len(tickers)} tickers (fenêtre de 7 jours)...")
    try:
        # On télécharge les cours de clôture
        raw_data = yf.download(tickers, period="7d", interval="1d")['Close']
    except Exception as e:
        print(f"❌ Erreur Yahoo Finance : {e}")
        return

    rows_to_upsert = []
    
    # Gestion du cas où yf.download renvoie un Series (si 1 seul ticker) au lieu d'un DataFrame
    if isinstance(raw_data, pd.Series):
        raw_data = raw_data.to_frame()

    for ticker in tickers:
        if ticker not in raw_data.columns:
            continue
            
        series = raw_data[ticker].dropna()
        
        # On vérifie qu'on a au moins 2 jours pour calculer le rendement
        if len(series) >= 2:
            last_price = float(series.iloc[-1])
            prev_price = float(series.iloc[-2])
            daily_return = (last_price / prev_price) - 1
            last_date = series.index[-1].strftime('%Y-%m-%d')

            info = assets_to_update[ticker]
            rows_to_upsert.append({
                "price_date": last_date,
                "asset_symbol": ticker,
                "asset_name": info['asset_name'],
                "asset_currency": info['asset_currency'],
                "close_price": round(last_price, 4),
                "daily_return": round(daily_return, 6)
            })

    # 4. Envoi (Upsert) vers Supabase
    if rows_to_upsert:
        print(f"🚀 Upsert de {len(rows_to_upsert)} lignes vers Financial_Data...")
        try:
            supabase.table("Financial_Data").upsert(rows_to_upsert).execute()
            print("✅ Synchronisation réussie !")
        except Exception as e:
            print(f"❌ Erreur lors de l'upsert : {e}")
    else:
        print("⚠️ Aucune donnée récente à mettre à jour.")

if __name__ == "__main__":
    sync()