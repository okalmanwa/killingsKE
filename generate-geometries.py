import os
import json

# Ensure the output directory exists
output_folder = './coordinates'
os.makedirs(output_folder, exist_ok=True)

for filename in os.listdir('./counties'):
    # Process only .json files
    if filename.endswith('.json'):
        # Load the JSON file from the counties folder
        with open(f'./counties/{filename}', 'r') as f:
            data = json.load(f)
            
            # Check if both centroid and geometries exist
            if 'centroid' not in data or 'coordinates' not in data['centroid']:
                print(f"Skipping {filename}: Missing 'centroid' or 'coordinates'")
                continue
            if 'geometries' not in data or not data['geometries']:
                print(f"Skipping {filename}: Missing 'geometries'")
                continue
            
            # Extract required data
            centre = data['centroid']['coordinates']
            coordinates = data['geometries'][0]['coordinates']

            # Create the output object
            county = {
                "center": centre,
                "geometries": {
                    "type": "MultiPolygon",
                    "coordinates": coordinates,
                }
            }

            # Serialize and save the output JSON
            output_path = f'{output_folder}/{filename}'
            with open(output_path, 'w') as outfile:
                json.dump(county, outfile, indent=4)

            print(f"Processed and saved: {output_path}")
