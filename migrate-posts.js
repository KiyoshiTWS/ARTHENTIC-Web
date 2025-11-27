// Firebase Post Migration Script
// Run this in your browser console while logged into arthub.html

console.log('🚀 Starting Firebase Multi-Image Migration...');
console.log('⏳ This will add image_urls field to all posts...\n');

async function migratePostsToMultiImage() {
  try {
    // Check if Firebase is available
    if (!window.firebaseArtHubClient || !window.firebaseArtHubClient.db) {
      throw new Error('❌ Firebase client not available. Please ensure you are logged in to arthub.html');
    }

    const db = window.firebaseArtHubClient.db;
    const { collection, getDocs, doc, updateDoc } = window.firebaseModules;
    
    if (!collection || !getDocs || !updateDoc) {
      throw new Error('❌ Firebase modules not loaded. Please refresh the page and try again.');
    }

    console.log('📊 Fetching all posts from Firebase...');
    const postsRef = collection(db, 'posts');
    const snapshot = await getDocs(postsRef);
    
    console.log(`📦 Found ${snapshot.size} posts total\n`);
    
    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors = [];
    
    for (const docSnapshot of snapshot.docs) {
      const postId = docSnapshot.id;
      const data = docSnapshot.data();
      
      // Skip if already has image_urls
      if (data.image_urls !== undefined) {
        skippedCount++;
        console.log(`⏭️  Skipped post ${postId} (already migrated)`);
        continue;
      }
      
      // Prepare update
      const updates = {};
      
      if (data.image_url) {
        // Convert single image to array
        updates.image_urls = [data.image_url];
        console.log(`🔄 Migrating post ${postId} (has image)`);
      } else {
        // No image, create empty array
        updates.image_urls = [];
        console.log(`🔄 Migrating post ${postId} (no image)`);
      }
      
      try {
        await updateDoc(doc(db, 'posts', postId), updates);
        migratedCount++;
        console.log(`✅ Successfully migrated post ${postId}`);
      } catch (error) {
        errorCount++;
        errors.push({ postId, error: error.message });
        console.error(`❌ Failed to migrate post ${postId}:`, error.message);
      }
      
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Final summary
    console.log('\n' + '='.repeat(50));
    console.log('✅ MIGRATION COMPLETE!');
    console.log('='.repeat(50));
    console.log(`📊 Total posts processed: ${snapshot.size}`);
    console.log(`✅ Successfully migrated: ${migratedCount}`);
    console.log(`⏭️  Skipped (already done): ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    
    if (errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      errors.forEach(({ postId, error }) => {
        console.log(`  - Post ${postId}: ${error}`);
      });
    }
    
    console.log('\n🎉 Migration finished! Refresh the page to see changes.');
    
    return {
      total: snapshot.size,
      migrated: migratedCount,
      skipped: skippedCount,
      errors: errorCount
    };
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Stack trace:', error.stack);
    throw error;
  }
}

// Run migration
migratePostsToMultiImage()
  .then(results => {
    console.log('\n📈 Final Results:', results);
  })
  .catch(error => {
    console.error('\n💥 Migration script crashed:', error);
  });
