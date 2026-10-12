import '../config/env';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDatabase } from '../config/database';
import { User } from '../models/User';
import { Party } from '../models/Party';
import { Campaign } from '../models/Campaign';
import { GeographicArea } from '../models/GeographicArea';
import { VoterRecord } from '../models/VoterRecord';
import { AuditLog } from '../models/AuditLog';

async function seed() {
  await connectDatabase();

  const force = process.argv.includes('--force');
  const existingAdmin = await User.findOne({ role: 'MAIN_ADMIN' });
  if (existingAdmin) {
    if (!force) {
      console.log('Seed data already exists. Use --force to re-seed (clears all data).');
      await mongoose.disconnect();
      return;
    }
    console.log('Force flag detected. Clearing existing data...');
    await Promise.all([
      User.deleteMany({}),
      Party.deleteMany({}),
      Campaign.deleteMany({}),
      GeographicArea.deleteMany({}),
      VoterRecord.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);
    console.log('Existing data cleared.');
  }

  console.log('Seeding database...');

  const adminHash = await bcrypt.hash('Admin@123', 12);
  const admin = await User.create({
    name: 'Main Administrator',
    username: 'admin',
    passwordHash: adminHash,
    role: 'MAIN_ADMIN',
    status: 'active',
    mustChangePassword: false,
  });

  // Create a demo party
  const party = await Party.create({
    name: 'Municipal Progressive Party',
    description: 'Demo party for Municipal Election 2026',
    createdBy: admin._id,
    status: 'active',
  });

  const mayorHash = await bcrypt.hash('Mayor@123', 12);
  const mayor = await User.create({
    name: 'Rajesh Kumar',
    username: 'mayor_rajesh',
    passwordHash: mayorHash,
    role: 'MAYOR',
    status: 'active',
    partyId: party._id,
    parentUserId: admin._id,
    createdBy: admin._id,
    mustChangePassword: false,
  });

  party.adminUserId = mayor._id;
  await party.save();

  const campaign = await Campaign.create({
    name: 'Municipal Election 2026',
    description: 'Municipal Corporation election campaign for 2026',
    status: 'active',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    createdBy: mayor._id,
    partyId: party._id,
  });

  const ward1 = await GeographicArea.create({
    name: 'Ward 1 - North Zone',
    areaType: 'ward',
    campaignId: campaign._id,
    partyId: party._id,
    managerIds: [mayor._id],
  });

  const ward2 = await GeographicArea.create({
    name: 'Ward 2 - South Zone',
    areaType: 'ward',
    campaignId: campaign._id,
    partyId: party._id,
    managerIds: [mayor._id],
  });

  const corporatorHash = await bcrypt.hash('Corporator@123', 12);
  const corporator = await User.create({
    name: 'Priya Sharma',
    username: 'corporator_priya',
    passwordHash: corporatorHash,
    role: 'CORPORATOR',
    status: 'active',
    partyId: party._id,
    parentUserId: mayor._id,
    createdBy: mayor._id,
    assignedScopeIds: [ward1._id],
    mustChangePassword: false,
  });

  const divHash = await bcrypt.hash('Divisional@123', 12);
  const divIncharge = await User.create({
    name: 'Suresh Nair',
    username: 'div_suresh',
    passwordHash: divHash,
    role: 'DIVISIONAL_INCHARGE',
    status: 'active',
    partyId: party._id,
    parentUserId: corporator._id,
    createdBy: corporator._id,
    assignedScopeIds: [ward1._id],
    mustChangePassword: false,
  });

  const memberHash = await bcrypt.hash('Member@123', 12);
  const member1 = await User.create({
    name: 'Amit Patel',
    username: 'member_amit',
    passwordHash: memberHash,
    role: 'WARD_MEMBER',
    status: 'active',
    partyId: party._id,
    parentUserId: divIncharge._id,
    createdBy: divIncharge._id,
    assignedScopeIds: [ward1._id],
    mustChangePassword: false,
  });

  const member2 = await User.create({
    name: 'Sunita Devi',
    username: 'member_sunita',
    passwordHash: memberHash,
    role: 'WARD_MEMBER',
    status: 'active',
    partyId: party._id,
    parentUserId: divIncharge._id,
    createdBy: divIncharge._id,
    assignedScopeIds: [ward2._id],
    mustChangePassword: false,
  });

  const sampleVoters = [
    { name: 'Ravi Shankar', houseNumber: 'A-101', address: 'North Street', phone: '9876543210' },
    { name: 'Meena Kumari', houseNumber: 'A-102', address: 'North Street', phone: '9876543211' },
    { name: 'Suresh Babu', houseNumber: 'B-201', address: 'Lake View Road', phone: '9876543212' },
    { name: 'Lakshmi Devi', houseNumber: 'B-202', address: 'Lake View Road', phone: '9876543213' },
    { name: 'Vijay Kumar', houseNumber: 'C-301', address: 'Garden Colony', phone: '9876543214' },
  ];

  for (const v of sampleVoters) {
    await VoterRecord.create({
      campaignId: campaign._id,
      geographicAreaId: ward1._id,
      partyId: party._id,
      name: v.name,
      houseNumber: v.houseNumber,
      address: v.address,
      phone: v.phone,
      recordStatus: 'unassigned',
    });
  }

  console.log('\n✅ Seed complete! Login credentials:');
  console.log('  Admin:              admin / Admin@123');
  console.log('  Mayor:              mayor_rajesh / Mayor@123');
  console.log('  Corporator:         corporator_priya / Corporator@123');
  console.log('  Divisional Incharge: div_suresh / Divisional@123');
  console.log('  Ward Member:        member_amit / Member@123');
  console.log('  Ward Member:        member_sunita / Member@123');
  console.log(`  Party:              Municipal Progressive Party`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
