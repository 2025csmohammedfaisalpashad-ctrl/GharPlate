"""
GharPlate Multi-Source Food & Packaged Product Integration Layer.
Provides normalized, cached, rate-limited adapters for:
- Source A: Open Food Facts (API v3 primary + v2 search adapter)
- Source B: USDA FoodData Central (FDC API v1)
- Source C: Indian Official Food Composition (ICMR-NIN IFCT 2017 & DGI 2024 local catalog)
- Source D: Configurable External Web Search (Brave Search / Tavily)
"""
