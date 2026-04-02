// Basic Usage Example for nostr-sdk
//
// Demonstrates: key generation, event creation, connecting to relays,
// publishing events, subscribing to events, and receiving events.
//
// Cargo.toml dependencies:
//   nostr-sdk = "0.38"
//   tokio = { version = "1", features = ["full"] }
//   tracing-subscriber = "0.3"
//
// Run: cargo run --example basic_usage

use std::time::Duration;

use nostr_sdk::prelude::*;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging (optional but helpful for debugging)
    tracing_subscriber::fmt::init();

    // ---------------------------------------------------------------
    // 1. KEY GENERATION AND MANAGEMENT
    // ---------------------------------------------------------------

    // Generate a brand new keypair
    let keys = Keys::generate();
    println!("=== Key Generation ===");
    println!("Public key (hex):    {}", keys.public_key().to_hex());
    println!("Public key (bech32): {}", keys.public_key().to_bech32()?);
    println!("Secret key (bech32): {}", keys.secret_key().to_bech32()?);
    println!();

    // You can also parse an existing secret key:
    // let keys = Keys::parse("nsec1...")?;
    // let keys = Keys::parse("hex_secret_key_here")?;

    // ---------------------------------------------------------------
    // 2. BUILD A CLIENT AND CONNECT TO RELAYS
    // ---------------------------------------------------------------

    let client = Client::builder().signer(keys.clone()).build();

    // Add relays (connection is not started yet)
    client.add_relay("wss://relay.damus.io").await?;
    client.add_relay("wss://nos.lol").await?;
    client.add_relay("wss://relay.rip").await?;

    println!("=== Connecting to Relays ===");
    client.connect().await;
    println!("Connected to {} relays", client.relays().await.len());
    println!();

    // ---------------------------------------------------------------
    // 3. SET PROFILE METADATA
    // ---------------------------------------------------------------

    let metadata = Metadata::new()
        .name("nostr-sdk-example-bot")
        .about("A basic example bot built with rust-nostr")
        .nip05("bot@example.com");

    let output = client
        .send_event_builder(EventBuilder::metadata(&metadata))
        .await?;
    println!("=== Profile Metadata ===");
    println!("Metadata event ID: {}", output.id().to_bech32()?);
    println!("Sent to {} relays", output.success.len());
    println!();

    // ---------------------------------------------------------------
    // 4. PUBLISH A TEXT NOTE
    // ---------------------------------------------------------------

    let builder = EventBuilder::text_note("Hello from rust-nostr! This is a basic usage example.")
        .tag(Tag::hashtag("nostr"))
        .tag(Tag::hashtag("rust"));

    let output = client.send_event_builder(builder).await?;
    let note_id = output.id();
    println!("=== Published Text Note ===");
    println!("Note ID: {}", note_id.to_bech32()?);
    println!("Accepted by: {:?}", output.success);
    if !output.failed.is_empty() {
        println!("Rejected by: {:?}", output.failed);
    }
    println!();

    // ---------------------------------------------------------------
    // 5. PUBLISH A TEXT NOTE WITH PROOF-OF-WORK
    // ---------------------------------------------------------------

    let builder = EventBuilder::text_note("This note has proof-of-work attached").pow(16);
    let output = client.send_event_builder(builder).await?;
    println!("=== POW Text Note ===");
    println!("POW Note ID: {}", output.id().to_bech32()?);
    println!();

    // ---------------------------------------------------------------
    // 6. REACT TO AN EVENT
    // ---------------------------------------------------------------

    // Create a reaction to our own note
    let event_to_fetch = client.sign_event_builder(
        EventBuilder::text_note("Hello from rust-nostr! This is a basic usage example.")
    ).await?;

    let builder = EventBuilder::reaction(&event_to_fetch, "+");
    client.send_event_builder(builder).await?;
    println!("=== Reaction ===");
    println!("Reacted to: {}", event_to_fetch.id.to_bech32()?);
    println!();

    // ---------------------------------------------------------------
    // 7. FETCH EVENTS (short-lived query)
    // ---------------------------------------------------------------

    println!("=== Fetching Recent Text Notes ===");

    let filter = Filter::new()
        .kind(Kind::TextNote)
        .limit(5);

    let events = client
        .fetch_events(filter)
        .timeout(Duration::from_secs(10))
        .await?;

    println!("Fetched {} events:", events.len());
    for event in events.iter().take(5) {
        let content_preview = if event.content.len() > 80 {
            format!("{}...", &event.content[..80])
        } else {
            event.content.clone()
        };
        println!(
            "  [{}] {}: {}",
            event.created_at,
            &event.pubkey.to_hex()[..8],
            content_preview,
        );
    }
    println!();

    // ---------------------------------------------------------------
    // 8. STREAM EVENTS (short-lived subscription with async iterator)
    // ---------------------------------------------------------------

    println!("=== Streaming Text Notes (10 seconds) ===");

    let filter = Filter::new()
        .kind(Kind::TextNote)
        .since(Timestamp::now());

    let mut stream = client
        .stream_events(filter)
        .timeout(Duration::from_secs(10))
        .policy(ReqExitPolicy::WaitForTimeout)
        .await?;

    let mut count = 0;
    while let Some((relay_url, result)) = stream.next().await {
        match result {
            Ok(event) => {
                count += 1;
                let content_preview = if event.content.len() > 60 {
                    format!("{}...", &event.content[..60])
                } else {
                    event.content.clone()
                };
                println!(
                    "  [{}] from {}: {}",
                    relay_url,
                    &event.pubkey.to_hex()[..8],
                    content_preview,
                );

                // Stop after 10 events for this demo
                if count >= 10 {
                    break;
                }
            }
            Err(e) => {
                eprintln!("  Error: {}", e);
            }
        }
    }
    println!("Streamed {} events", count);
    println!();

    // ---------------------------------------------------------------
    // 9. LONG-LIVED SUBSCRIPTION (via notifications)
    // ---------------------------------------------------------------

    println!("=== Long-lived Subscription (15 seconds) ===");

    let filter = Filter::new()
        .kind(Kind::TextNote)
        .since(Timestamp::now());

    let Output { val: sub_id, .. } = client.subscribe(filter).await?;
    println!("Subscription ID: {}", sub_id);

    let mut notifications = client.notifications();
    let deadline = Timestamp::now().as_u64() + 15;

    while let Some(notification) = notifications.next().await {
        // Exit after 15 seconds
        if Timestamp::now().as_u64() > deadline {
            break;
        }

        match notification {
            ClientNotification::Event {
                subscription_id,
                event,
                relay_url,
            } => {
                if subscription_id == sub_id {
                    let content_preview = if event.content.len() > 60 {
                        format!("{}...", &event.content[..60])
                    } else {
                        event.content.clone()
                    };
                    println!(
                        "  [{}] {}: {}",
                        relay_url,
                        &event.pubkey.to_hex()[..8],
                        content_preview,
                    );
                }
            }
            ClientNotification::Message { relay_url, message } => {
                if let RelayMessage::Notice(notice) = message {
                    println!("  Notice from {}: {}", relay_url, notice);
                }
            }
            _ => {}
        }
    }

    // Clean up: close subscription
    client.unsubscribe(&sub_id).await?;
    println!("Subscription closed");
    println!();

    // ---------------------------------------------------------------
    // 10. DELETE AN EVENT
    // ---------------------------------------------------------------

    let delete_request = EventDeletionRequest::new()
        .id(note_id)
        .reason("cleaning up example events");
    let builder = EventBuilder::delete(delete_request);
    client.send_event_builder(builder).await?;
    println!("=== Cleanup ===");
    println!("Deletion request sent for: {}", note_id.to_bech32()?);

    // ---------------------------------------------------------------
    // SHUTDOWN
    // ---------------------------------------------------------------

    client.shutdown().await;
    println!("Client shut down. Done!");

    Ok(())
}
