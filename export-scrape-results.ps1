# Export scrape results to text file
param(
    [string]$OutputFile = "scrape-results-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').txt"
)

$output = @()
$output += "=" * 80
$output += "Discord Scrape Results - $(Get-Date)"
$output += "=" * 80
$output += ""

# Get all jobs
$output += "=== SCRAPE JOBS ==="
$output += ""
$jobs = Invoke-RestMethod -Uri "http://localhost:3001/api/scrape/jobs" -Method GET
foreach ($job in $jobs) {
    $output += "Job #$($job.id): $($job.status) - $($job.messages_scraped) messages"
    $output += "  Channel: $($job.channel_id)"
    $output += "  Type: $($job.scrape_type)"
    $output += "  Started: $($job.started_at)"
    $output += "  Completed: $($job.completed_at)"
    if ($job.error_message) {
        $output += "  ERROR: $($job.error_message)"
    }
    $output += ""
}

# Get servers
$output += "=== SERVERS ==="
$output += ""
$servers = Invoke-RestMethod -Uri "http://localhost:3001/api/servers" -Method GET
foreach ($server in $servers) {
    $output += "Server: $($server.name) (ID: $($server.id))"

    # Get channels for this server
    $channels = Invoke-RestMethod -Uri "http://localhost:3001/api/servers/$($server.id)/channels" -Method GET
    foreach ($channel in $channels) {
        $output += "  → Channel: $($channel.name) (ID: $($channel.id))"
        $output += "     Message count: $($channel.message_count)"

        # Get sample messages
        try {
            $messages = Invoke-RestMethod -Uri "http://localhost:3001/api/messages/$($channel.id)?limit=20" -Method GET

            $output += ""
            $output += "     Recent Messages:"
            $output += "     " + ("-" * 70)

            $withContent = 0
            $withAuthor = 0
            $empty = 0

            foreach ($msg in $messages) {
                if ($msg.content) { $withContent++ }
                if ($msg.author_name) { $withAuthor++ }
                if (-not $msg.content -and -not $msg.author_name) { $empty++ }

                $author = if ($msg.author_name) { $msg.author_name } else { "UNKNOWN" }
                $content = if ($msg.content) { $msg.content.Substring(0, [Math]::Min(60, $msg.content.Length)) } else { "(EMPTY)" }

                $output += "     [$($msg.timestamp)] $author"
                $output += "       $content"
                if ($msg.reply_to_message_id) {
                    $output += "       └─ Reply to: $($msg.reply_to_message_id)"
                }
                $output += ""
            }

            $output += "     " + ("-" * 70)
            $output += "     Sample Stats (20 messages):"
            $output += "       With Content: $withContent/20 ($([Math]::Round($withContent/20*100))%)"
            $output += "       With Author: $withAuthor/20 ($([Math]::Round($withAuthor/20*100))%)"
            $output += "       Empty: $empty/20 ($([Math]::Round($empty/20*100))%)"

        } catch {
            $output += "     ERROR fetching messages: $_"
        }
    }
    $output += ""
}

$output += "=" * 80
$output += "End of Report"
$output += "=" * 80

# Write to file
$output | Out-File -FilePath $OutputFile -Encoding UTF8

Write-Host "`n✓ Results exported to: $OutputFile" -ForegroundColor Green
Write-Host "  Total lines: $($output.Count)" -ForegroundColor Cyan

# Also display to console
Write-Host "`n--- Preview ---" -ForegroundColor Yellow
$output | Select-Object -First 50 | ForEach-Object { Write-Host $_ }
if ($output.Count -gt 50) {
    Write-Host "... (truncated, see $OutputFile for full output)" -ForegroundColor Gray
}
