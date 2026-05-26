# Basic Usage Examples

## Analyzing a PDF

```
> Analyze the Q4 earnings report in ./reports/q4-2025.pdf

[Quantcept parses the PDF, extracts tables, and summarizes key metrics]
```

## Working with CSV Data

```
> What are the top 5 stocks by returns in portfolio.csv?

[Quantcept reads the CSV, runs statistical analysis, and presents results]
```

## Financial Calculations

```
> Calculate the NPV of cash flows [-100000, 25000, 35000, 45000, 50000] at 8% discount rate

[Quantcept uses the calculator tool to compute NPV]
```

## Fetching Market Data

```
> Fetch the latest headlines from https://finance.yahoo.com

[Quantcept fetches the page and summarizes relevant content]
```

## Multi-step Analysis

```
> Read all the CSV files in ./data/, compare year-over-year revenue growth, and export a summary

[Quantcept uses glob to find files, reads each one, analyzes the data, and exports results]
```
