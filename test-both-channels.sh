#!/bin/bash

# Test scraping script - scrapes both channels and exports results
# Usage: ./test-both-channels.sh

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT_FILE="scrape-test-results-${TIMESTAMP}.txt"

echo "Discord Scraper Test Run" > "$OUTPUT_FILE"
echo "========================" >> "$OUTPUT_FILE"
echo "Date: $(date)" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Channel 1: LuxAlgo Community
echo ">>> Scraping Channel 1: LuxAlgo Community #hangout" | tee -a "$OUTPUT_FILE"
RESPONSE1=$(curl -s -X POST http://localhost:3001/api/scrape/start \
  -H "Content-Type: application/json" \
  -d '{"channel_id": "699061739043553381", "scrape_type": "full"}')

echo "$RESPONSE1" | jq '.' >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

sleep 2

# Channel 2: Second Server
echo ">>> Scraping Channel 2: Second Server" | tee -a "$OUTPUT_FILE"
RESPONSE2=$(curl -s -X POST http://localhost:3001/api/scrape/start \
  -H "Content-Type: application/json" \
  -d '{"channel_id": "717116614771998790", "scrape_type": "full"}')

echo "$RESPONSE2" | jq '.' >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

sleep 1

# Get all scrape jobs
echo "=== ALL SCRAPE JOBS ===" >> "$OUTPUT_FILE"
curl -s http://localhost:3001/api/scrape/jobs | jq '.' >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Get sample messages from Channel 1
echo "=== CHANNEL 1 SAMPLE MESSAGES (20 most recent) ===" >> "$OUTPUT_FILE"
curl -s "http://localhost:3001/api/messages/699061739043553381?limit=20" | jq -r '.[] | "[\(.timestamp)] \(.author_name // "UNKNOWN"): \(.content // "(EMPTY)")\n  ID: \(.id)"' >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Get sample messages from Channel 2
echo "=== CHANNEL 2 SAMPLE MESSAGES (20 most recent) ===" >> "$OUTPUT_FILE"
curl -s "http://localhost:3001/api/messages/717116614771998790?limit=20" | jq -r '.[] | "[\(.timestamp)] \(.author_name // "UNKNOWN"): \(.content // "(EMPTY)")\n  ID: \(.id)"' >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Calculate statistics
echo "=== STATISTICS ===" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Channel 1 stats
TOTAL_CH1=$(curl -s "http://localhost:3001/api/messages/699061739043553381?limit=1000" | jq 'length')
WITH_CONTENT_CH1=$(curl -s "http://localhost:3001/api/messages/699061739043553381?limit=1000" | jq '[.[] | select(.content != null and .content != "")] | length')
WITH_AUTHOR_CH1=$(curl -s "http://localhost:3001/api/messages/699061739043553381?limit=1000" | jq '[.[] | select(.author_name != null and .author_name != "")] | length')

echo "Channel 1 (LuxAlgo #hangout):" >> "$OUTPUT_FILE"
echo "  Total messages: $TOTAL_CH1" >> "$OUTPUT_FILE"
echo "  With content: $WITH_CONTENT_CH1 ($(( WITH_CONTENT_CH1 * 100 / TOTAL_CH1 ))%)" >> "$OUTPUT_FILE"
echo "  With author: $WITH_AUTHOR_CH1 ($(( WITH_AUTHOR_CH1 * 100 / TOTAL_CH1 ))%)" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Channel 2 stats
TOTAL_CH2=$(curl -s "http://localhost:3001/api/messages/717116614771998790?limit=1000" | jq 'length')
WITH_CONTENT_CH2=$(curl -s "http://localhost:3001/api/messages/717116614771998790?limit=1000" | jq '[.[] | select(.content != null and .content != "")] | length')
WITH_AUTHOR_CH2=$(curl -s "http://localhost:3001/api/messages/717116614771998790?limit=1000" | jq '[.[] | select(.author_name != null and .author_name != "")] | length')

echo "Channel 2 (Second Server):" >> "$OUTPUT_FILE"
echo "  Total messages: $TOTAL_CH2" >> "$OUTPUT_FILE"
echo "  With content: $WITH_CONTENT_CH2 ($(( WITH_CONTENT_CH2 * 100 / TOTAL_CH2 ))%)" >> "$OUTPUT_FILE"
echo "  With author: $WITH_AUTHOR_CH2 ($(( WITH_AUTHOR_CH2 * 100 / TOTAL_CH2 ))%)" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

echo "=== END OF REPORT ===" >> "$OUTPUT_FILE"

echo ""
echo "✓ Test complete!"
echo "✓ Results saved to: $OUTPUT_FILE"
echo ""
echo "Summary:"
echo "  Channel 1: $TOTAL_CH1 messages ($WITH_CONTENT_CH1 with content, $WITH_AUTHOR_CH1 with author)"
echo "  Channel 2: $TOTAL_CH2 messages ($WITH_CONTENT_CH2 with content, $WITH_AUTHOR_CH2 with author)"
echo ""
cat "$OUTPUT_FILE"
