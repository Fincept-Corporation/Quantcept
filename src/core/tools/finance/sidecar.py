import sys, json, math


def clean(v):
    if isinstance(v, float) and math.isnan(v):
        return None
    return v


def df_to_obj(df):
    if df is None or getattr(df, "empty", True):
        return {}
    return {
        (str(c.date()) if hasattr(c, "date") else str(c)): {str(i): clean(df.loc[i, c]) for i in df.index}
        for c in df.columns
    }


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "usage: sidecar.py <ticker> <kind> [period]"}))
        return
    try:
        import yfinance as yf
    except Exception:
        print(json.dumps({"error": "yfinance_not_installed"}))
        return
    ticker = sys.argv[1]
    kind = sys.argv[2]
    period = sys.argv[3] if len(sys.argv) > 3 else "1mo"
    try:
        t = yf.Ticker(ticker)
        if kind == "info":
            i = t.info or {}
            keys = (
                "longName", "symbol", "sector", "industry", "currency", "marketCap",
                "trailingPE", "forwardPE", "dividendYield", "fiftyTwoWeekHigh",
                "fiftyTwoWeekLow", "regularMarketPrice",
            )
            out = {k: clean(i.get(k)) for k in keys}
        elif kind == "income":
            out = df_to_obj(t.income_stmt)
        elif kind == "balance":
            out = df_to_obj(t.balance_sheet)
        elif kind == "cashflow":
            out = df_to_obj(t.cashflow)
        elif kind == "history":
            h = t.history(period=period)
            out = {
                str(idx.date()): {col: clean(h.loc[idx, col]) for col in ("Open", "High", "Low", "Close", "Volume")}
                for idx in h.index
            }
        else:
            print(json.dumps({"error": f"unknown kind: {kind}"}))
            return
        print(json.dumps({"data": out}, default=str))
    except Exception as e:  # noqa: BLE001 — surface any yfinance/network error as JSON
        print(json.dumps({"error": str(e)}))


main()
