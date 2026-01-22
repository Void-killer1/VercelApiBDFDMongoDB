const mongoose = require('mongoose');

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { mongoUri, userId } = req.query;

    if (!mongoUri) {
        return res.status(400).json({
            error: "Eksik mongoUri!",
            ipucu: "Komutun başına $url[encode;...] eklediğinizden emin olun."
        });
    }

    let connection;
    try {
        // Bağlantı kurulumu
        connection = await mongoose.createConnection(mongoUri, {
            serverSelectionTimeoutMS: 5000
        }).asPromise();

        const DynamicSchema = new mongoose.Schema({}, { strict: false, collection: 'UserData' });
        const Model = connection.model('Data', DynamicSchema);

        // --- MONGODB İSTATİSTİKLERİNİ ÇEK ---
        const stats = await connection.db.command({ dbStats: 1 });
        
        // Ücretsiz Atlas kotası genelde 512MB (536870912 byte)
        const totalQuota = 512 * 1024 * 1024; 
        const usedBytes = stats.dataSize + stats.indexSize;
        const remainingBytes = totalQuota - usedBytes;
        
        const storageInfo = {
            db_adi: stats.db,
            toplam_kayit: stats.objects,
            kullanilan_mb: (usedBytes / (1024 * 1024)).toFixed(2) + " MB",
            kalan_mb: (remainingBytes / (1024 * 1024)).toFixed(2) + " MB",
            doluluk_orani: "%" + ((usedBytes / totalQuota) * 100).toFixed(2)
        };

        // --- GET: VERİ ÇEKME VEYA LİSTELEME ---
        if (req.method === 'GET') {
            if (userId) {
                const data = await Model.findOne({ userId });
                return res.status(200).json({ storage: storageInfo, data: data || { exists: false } });
            } else {
                const allData = await Model.find({}).limit(100);
                return res.status(200).json({ storage: storageInfo, users: allData });
            }
        }

        // --- POST: DİNAMİK VERİ KAYDETME ---
        if (req.method === 'POST') {
            const payload = { ...req.query };
            delete payload.mongoUri;

            if (!payload.userId) throw new Error("userId parametresi şart!");

            const updated = await Model.findOneAndUpdate(
                { userId: payload.userId },
                { $set: payload },
                { upsert: true, new: true }
            );
            return res.status(200).json({ success: true, storage: storageInfo, updated });
        }

        // --- DELETE: VERİ SİLME ---
        if (req.method === 'DELETE') {
            const result = await Model.deleteOne({ userId });
            return res.status(200).json({ success: true, storage: storageInfo, deletedCount: result.deletedCount });
        }

    } catch (err) {
        return res.status(500).json({
            error: "Hata",
            detay: err.message,
            yardim: "IP izni veya URL hatası olabilir."
        });
    } finally {
        if (connection) await connection.close();
    }
}
                { upsert: true, new: true }
            );
            await conn.close();
            return res.status(200).json({ success: true, updated });
        }

    } catch (err) {
        return res.status(500).json({ error: "Bağlantı Hatası: " + err.message });
    }
}
