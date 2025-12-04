# Testing the Hex Map Feature

## Quick Start Testing Guide

### Prerequisites

1. Make sure the MCP server is running with a campaign that has hex maps
2. The gamemaster-client dev server is running (`npm run dev`)
3. You're connected to the MCP server

### Test Scenario 1: Basic Map Display

**Setup:**
```python
# In the MCP server, create a simple test map
create_hex_map(
    name="Test Map",
    description="A small test map for the hex display feature"
)

# Add some hexes with different terrains
add_or_update_hex(x=0, y=0, terrain="plains", discovered=True, map_name="Test Map")
add_or_update_hex(x=1, y=0, terrain="forest", discovered=True, map_name="Test Map")
add_or_update_hex(x=0, y=1, terrain="hills", discovered=True, map_name="Test Map")
add_or_update_hex(x=1, y=1, terrain="water", discovered=True, map_name="Test Map")
add_or_update_hex(x=2, y=0, terrain="mountains", discovered=False, map_name="Test Map")

# Create a location and link it to the map
create_location(
    name="Test Village",
    location_type="village",
    description="A test village",
    primary_map="Test Map",
    hex_x=1,
    hex_y=0
)

# Set current location
update_game_state(current_location="Test Village")
```

**Test Steps:**
1. Open the gamemaster-client in your browser
2. Look at the upper-right panel (GameStatePanel)
3. You should see "Test Village" as the current location
4. **Verify**: A 🗺️ button appears next to "Test Village"
5. Click the 🗺️ button
6. **Verify**: Modal opens showing the hex map
7. **Verify**: You see 5 hexes in different colors
8. **Verify**: The undiscovered hex (2,0) is dimmed (50% opacity)
9. Hover over each hex
10. **Verify**: Tooltip appears showing coordinate and terrain type
11. Try zooming with mouse wheel
12. **Verify**: Map zooms in and out smoothly
13. Click and drag on the map
14. **Verify**: Map pans around
15. Click the + and − buttons in the controls
16. **Verify**: Map zooms in and out
17. Click the ⟲ button
18. **Verify**: Map returns to default view
19. Look at the terrain legend
20. **Verify**: Shows only the terrain types present (plains, forest, hills, water, mountains)
21. Press ESC or click X
22. **Verify**: Modal closes

### Test Scenario 2: Map with POIs

**Setup:**
```python
# Add POIs to the map
add_poi_to_hex(
    x=1,
    y=0,
    name="Test Village",
    poi_type="village",
    discovered=True,
    map_name="Test Map"
)

add_poi_to_hex(
    x=0,
    y=1,
    name="Ancient Ruins",
    poi_type="ruins",
    discovered=False,
    map_name="Test Map"
)

add_poi_to_hex(
    x=1,
    y=1,
    name="Crystal Lake",
    poi_type="landmark",
    discovered=True,
    map_name="Test Map"
)
```

**Test Steps:**
1. Open the hex map again
2. **Verify**: You see emoji icons on hexes with POIs
   - 🏡 on hex (1,0) for village
   - 🏚️ on hex (0,1) for ruins
   - 📍 on hex (1,1) for landmark
3. Hover over each POI hex
4. **Verify**: Tooltip shows POI name and type
5. **Verify**: Undiscovered POI shows "(undiscovered)" label
6. Look at Map Info panel
7. **Verify**: Shows "POIs: 3"

### Test Scenario 3: Roads and Rivers

**Setup:**
```python
# Add a road
add_road(
    path=[(0, 0), (1, 0), (1, 1)],
    road_type="road",
    map_name="Test Map"
)

# Add a river
add_river(
    path=[(0, 1), (1, 1), (2, 1)],
    width="river",
    map_name="Test Map"
)
```

**Test Steps:**
1. Open the hex map again
2. **Verify**: You see a brown path connecting hexes (0,0) → (1,0) → (1,1)
3. **Verify**: You see a blue path flowing through hexes (0,1) → (1,1) → (2,1)
4. Look at Map Info panel
5. **Verify**: Shows "Roads: 1" and "Rivers: 1"

### Test Scenario 4: Larger Map (Stress Test)

**Setup:**
```python
# Create a 20x20 map with various terrains
create_hex_map(name="Large Test Map", hex_size_miles=6)

# Generate a grid of hexes with random terrains
terrains = ["plains", "forest", "hills", "mountains", "water", "desert", "swamp"]
for x in range(20):
    for y in range(20):
        terrain = terrains[(x + y) % len(terrains)]
        discovered = (x + y) % 3 == 0  # 1/3 discovered
        add_or_update_hex(
            x=x,
            y=y,
            terrain=terrain,
            discovered=discovered,
            map_name="Large Test Map"
        )

# Create location and set as current
create_location(
    name="Large Test Area",
    location_type="area",
    description="A large test area",
    primary_map="Large Test Map",
    hex_x=10,
    hex_y=10
)

update_game_state(current_location="Large Test Area")
```

**Test Steps:**
1. Open the hex map
2. **Verify**: Map renders 400 hexes without lag
3. **Verify**: Initial zoom is adjusted (smaller) for the larger map
4. Try zooming all the way in and out
5. **Verify**: Performance is smooth at all zoom levels
6. Pan around the entire map
7. **Verify**: All 400 hexes are visible at different pan positions
8. Look at Map Info
9. **Verify**: Shows "Hexes: 400"
10. Look at terrain legend
11. **Verify**: Shows all 7 terrain types used

### Test Scenario 5: No Map Available

**Setup:**
```python
# Set location without a map
create_location(
    name="Indoor Tavern",
    location_type="inn",
    description="A cozy tavern"
    # No primary_map field
)

update_game_state(current_location="Indoor Tavern")
```

**Test Steps:**
1. Look at the GameStatePanel
2. **Verify**: "Indoor Tavern" is shown as current location
3. **Verify**: NO 🗺️ button appears (since there's no map)

### Test Scenario 6: Error Handling

**Setup:**
```python
# Create location linked to non-existent map
create_location(
    name="Broken Location",
    location_type="area",
    description="Location with broken map reference",
    primary_map="NonExistentMap",
    hex_x=0,
    hex_y=0
)

update_game_state(current_location="Broken Location")
```

**Test Steps:**
1. Click the 🗺️ button
2. **Verify**: Modal opens with error state
3. **Verify**: Error message is displayed clearly
4. **Verify**: "Retry" button is available
5. Click "Retry"
6. **Verify**: Loading state shows, then error again

### Browser Console Testing

Open browser console (F12) and check for:
- **No errors** during map load
- **No warnings** about missing data
- Clean network requests to `/mcp` endpoint
- Proper JSON response format

### Visual Quality Checks

1. **Colors**: All terrain colors should be distinct and pleasant
2. **Icons**: POI emoji should be clearly visible and centered
3. **Roads**: Brown paths should be smooth and visible
4. **Rivers**: Blue paths should stand out
5. **Tooltip**: Should be readable with good contrast
6. **Controls**: Should be visually aligned and professional
7. **Legend**: Colors should match hexes exactly
8. **Modal**: Should have nice shadows and clean borders

### Responsive Testing

1. Resize browser window to different sizes
2. **Verify**: Modal adjusts appropriately
3. **Verify**: Controls panel stays visible
4. **Verify**: Tooltip doesn't go off-screen

### Accessibility Testing

1. **Keyboard**: Press ESC when modal is open
2. **Verify**: Modal closes
3. Hover tooltips should not require clicking
4. All buttons should have visible hover states

## Expected Results Summary

✅ **Button appears** when location has map
✅ **Button hidden** when no map available
✅ **Modal opens** smoothly
✅ **Map loads** from MCP server
✅ **Hexes render** with correct colors
✅ **POIs show** with correct icons
✅ **Roads render** as brown paths
✅ **Rivers render** as blue paths
✅ **Tooltips work** on hover
✅ **Zoom works** (wheel + buttons)
✅ **Pan works** (drag)
✅ **Controls work** (zoom, reset)
✅ **Legend accurate** (shows only used terrains)
✅ **Stats correct** (hex count, POIs, roads, rivers)
✅ **Performance good** (up to 40x40 hexes)
✅ **Error handling** (shows error + retry)
✅ **Modal closes** (ESC + X button)

## Troubleshooting Common Issues

### Button doesn't appear
- Check that `current_location` is set in game state
- Verify location has `primary_map` field
- Check browser console for errors

### Modal opens but stays loading
- Verify MCP server is running and accessible
- Check network tab for failed requests
- Verify `render_hex_map` tool is available
- Check that map exists in campaign

### Map renders but looks broken
- Check hex coordinate values (should be 0+)
- Verify terrain types match supported types
- Check POI types match supported types
- Look for console errors

### Performance is slow
- Check map size (>40x40 may be slow)
- Close other browser tabs
- Check for console warnings
- Consider reducing number of hexes

### Tooltips don't show
- Check that hexes have proper data
- Verify mouse events are working
- Check for CSS z-index issues
- Look for JavaScript errors

## Advanced Testing

### Performance Profiling
1. Open Chrome DevTools → Performance tab
2. Start recording
3. Open hex map and interact (zoom, pan)
4. Stop recording
5. Check for frame drops or long tasks

### Memory Usage
1. Open Chrome DevTools → Memory tab
2. Take heap snapshot before opening map
3. Open map
4. Take another heap snapshot
5. Compare to check for memory leaks

### Network Analysis
1. Open DevTools → Network tab
2. Click "Show Map" button
3. Check `/mcp` request:
   - Should be POST
   - Should have MCP headers
   - Response should be JSON
   - Should complete in <2 seconds

## Success Criteria

Your implementation is working correctly if:
- All test scenarios pass
- No console errors
- Performance is smooth
- Visual quality is good
- User experience is intuitive

Happy testing! 🗺️
