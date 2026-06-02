# Seeded with a known lookahead bias for the binary smoke test.
import pandas as pd

df = pd.DataFrame()
df["label"] = df["price"].shift(-1)  # bias/lookahead-shift
