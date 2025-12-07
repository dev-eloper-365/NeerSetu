# Supported States and Districts

## Overview

The NeerSetu application supports location detection and map visualization for Indian states and districts. There are two levels of support:

1. **Location Detection API** (`/api/detect-location`): Has a hardcoded list of states and major districts for text detection
2. **GeoJSON API** (`/api/geojson`): Can fetch boundaries for ANY state or district from remote GeoJSON sources

---

## ✅ All Supported States (36 States/Union Territories)

The following states are supported for location detection and map visualization:

### States (28)
1. Andhra Pradesh
2. Arunachal Pradesh
3. Assam
4. Bihar
5. Chhattisgarh
6. Goa
7. Gujarat
8. Haryana
9. Himachal Pradesh
10. Jharkhand
11. Karnataka
12. Kerala
13. Madhya Pradesh
14. Maharashtra
15. Manipur
16. Meghalaya
17. Mizoram
18. Nagaland
19. Odisha
20. Punjab
21. Rajasthan
22. Sikkim
23. Tamil Nadu
24. Telangana
25. Tripura
26. Uttar Pradesh
27. Uttarakhand
28. West Bengal

### Union Territories (8)
29. Andaman and Nicobar Islands
30. Chandigarh
31. Dadra and Nagar Haveli and Daman and Diu
32. Delhi
33. Jammu and Kashmir
34. Ladakh
35. Lakshadweep
36. Puducherry

---

## ✅ Districts with Location Detection Support (26 Major Districts)

The following districts are **hardcoded** in the location detection API and will be automatically detected from user queries:

### Gujarat (4 districts)
- Ahmedabad
- Surat
- Vadodara
- Rajkot

### Maharashtra (3 districts)
- Mumbai
- Pune
- Nagpur

### Karnataka (2 districts)
- Bangalore
- Bengaluru (alternative name)

### Tamil Nadu (1 district)
- Chennai

### Telangana (1 district)
- Hyderabad

### West Bengal (1 district)
- Kolkata

### Rajasthan (1 district)
- Jaipur

### Uttar Pradesh (1 district)
- Lucknow

### Bihar (1 district)
- Patna

### Madhya Pradesh (2 districts)
- Bhopal
- Indore

### Kerala (2 districts)
- Thiruvananthapuram
- Kochi

### Andhra Pradesh (1 district)
- Visakhapatnam

### Assam (1 district)
- Guwahati

### Odisha (1 district)
- Bhubaneswar

### Chhattisgarh (1 district)
- Raipur

### Jharkhand (1 district)
- Ranchi

### Uttarakhand (1 district)
- Dehradun

### Himachal Pradesh (1 district)
- Shimla

### Jammu and Kashmir (2 districts)
- Srinagar
- Jammu

### Ladakh (1 district)
- Leh

---

## 🌐 Extended Support via GeoJSON API

### Important Note

While only the districts listed above are **hardcoded for text detection**, the **GeoJSON API can fetch boundaries for ANY district** in India from the remote sources:

- **Primary Source**: `https://raw.githubusercontent.com/guneetnarula/indian-district-boundaries/master/geojson/india_districts.geojson`
- **Fallback Source**: `https://raw.githubusercontent.com/geohacker/india/master/district/india_district.geojson`

### How It Works

1. **For States**: 
   - All 36 states/UTs listed above are fully supported
   - When you request a state, the API automatically fetches and returns ALL districts within that state

2. **For Districts**:
   - Any district name that exists in the remote GeoJSON files will work
   - The API searches for districts by name in the comprehensive district files
   - If a district is found, its boundary will be returned

### Example Usage

Even if a district is not in the hardcoded list, you can still use it:

```
GET /api/geojson?district=Thane
GET /api/geojson?district=Gurgaon
GET /api/geojson?state=Maharashtra  // Returns state + all districts
```

---

## 📊 Summary

| Category | Count | Notes |
|----------|-------|-------|
| **States/UTs** | 36 | All Indian states and union territories |
| **Hardcoded Districts** | 26 | For automatic text detection |
| **Extended Districts** | ~700+ | All districts available via GeoJSON API |
| **Total Coverage** | All of India | Complete geographic coverage |

---

## 🔍 Testing Locations

To test the API, you can use:

### States
- `Gujarat`, `Maharashtra`, `Karnataka`, `Tamil Nadu`, `West Bengal`, etc.

### Districts (Hardcoded)
- `Ahmedabad`, `Mumbai`, `Bangalore`, `Chennai`, `Hyderabad`, etc.

### Districts (Extended - via API)
- Any district name from the GeoJSON sources (e.g., `Thane`, `Gurgaon`, `Noida`, etc.)

---

## 📝 Notes

1. **Location Detection**: Only hardcoded states/districts will be automatically detected from user text queries
2. **Map Visualization**: Any state or district that exists in the remote GeoJSON sources will work for map visualization
3. **District Boundaries**: When viewing a state, district boundaries are automatically loaded and displayed
4. **Name Matching**: The API uses flexible name matching (case-insensitive, handles variations)

---

## 🔗 Data Sources

- **State Boundaries**: `https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson`
- **District Boundaries**: 
  - Primary: `https://raw.githubusercontent.com/guneetnarula/indian-district-boundaries/master/geojson/india_districts.geojson`
  - Fallback: `https://raw.githubusercontent.com/geohacker/india/master/district/india_district.geojson`

