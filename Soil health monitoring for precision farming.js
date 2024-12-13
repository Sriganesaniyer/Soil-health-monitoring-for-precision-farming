// Step 1: Define coordinates for Tamil Nadu
var regions = {
  'Tamil Nadu': ee.Geometry.Point([78.6569, 10.7905]),
};

// Step 2: Load and filter Sentinel-2 Image Collection
function maskS2clouds(image) {
  var qa = image.select('QA60');
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
              .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.updateMask(mask);
}

// Step 3: Define functions to calculate NDVI, NDWI, and BSI
function addIndices(image) {
  var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
  var ndwi = image.normalizedDifference(['B3', 'B8']).rename('NDWI');
  var bsi = image.expression(
    '(SWIR + Red - NIR - Blue) / (SWIR + Red + NIR + Blue)', {
      'SWIR': image.select('B11'),
      'Red': image.select('B4'),
      'NIR': image.select('B8'),
      'Blue': image.select('B2')
    }).rename('BSI');
  return image.addBands(ndvi).addBands(ndwi).addBands(bsi);
}

// Step 4: Process each region and get average index values
var results = [];

for (var regionName in regions) {
  var region = regions[regionName];
  
  var dataset = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                  .filterDate('2020-01-01', '2020-01-30')
                  .filterBounds(region)
                  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
                  .map(maskS2clouds)
                  .map(addIndices);
  
  var meanImage = dataset.mean();

  // Step 5: Calculate average NDVI, NDWI, and BSI for the region
  var meanValues = meanImage.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: region.buffer(500),
    scale: 10,
    maxPixels: 1e13
  });
  
  // Step 6: Store results as a feature
  var feature = ee.Feature(null, {
    'Region': regionName,
    'NDVI': meanValues.get('NDVI'),
    'NDWI': meanValues.get('NDWI'),
    'BSI': meanValues.get('BSI')
  });
  
  results.push(feature);
}

// Step 7: Create a FeatureCollection and Export to Google Sheets
var resultsCollection = ee.FeatureCollection(results);

Export.table.toDrive({
  collection: resultsCollection,
  description: 'Average_Indices_To_Google_Sheets',
  fileFormat: 'CSV'
});
