#!/bin/bash

attach=false # default do not attach console output 
mode=full 
cwd=$(pwd)

while getopts "m:" opt; do 
	case ${opt} in 
		m ) 
			mode=${OPTARG}
			;;
		\? ) echo "Usage: [-m <full|fast>] to set spin up mode." && exit 1
			;;
	esac
done

# set options based on mode 
case ${mode} in 
	fast ) 
		dependencies=0
		build=0
		seed=0
		;;
	*) # full 
		dependencies=1 
		build=1 
		seed=1 
		;;
esac

echo -e "\n\nChecking for NVM"
# if [ -s "$NVM_DIR/nvm.sh" ]; then 
# 	. "$NVM_DIR/nvm.sh"
# 	nvm use 
# else 
# 	echo "	ERROR: NVM not found!"
# fi 

if [ ! -f "$cwd/.env" ]; then
	echo -e "\n\n.env file missing. Creating a symlink from development.env"
	ln -s dotenv .env
fi

echo -e "\n\nTearing down containers"
#docker compose down -v

docker compose up -d

if [ "$dependencies" = 1 ]; then
	echo -e "\n\nInstalling JS dependencies"
	cd $cwd && npm install
fi

echo -ne '\nWaiting for database '
waited=0
while ! docker compose exec devleague_db mysqladmin ping -u devleague --password=devleague -h devleague_db &> /dev/null; do
	sleep 1
	echo -ne "."
	((waited++))
	if [ "$waited" -gt 30 ]; then
		break
	fi
done

# If DB fails to start, terminate
if [ "$waited" -gt 30 ]; then
	echo -e "\n\nDatabase failed to start! Terminating startup." && exit 1
fi

# Database is up, continue environment setup
echo -e "\n\nDatabase is up!"

# echo -e "\n\nRunning Migrations"
# npm run migrate

echo -e "\n\nDumping DB Schema"
docker compose exec devleague_db mysqldump --no-tablespaces --skip-dump-date -d -u devleague --password=devleague devleague > dbschema-pristine.sql

if [ "$seed" = 1 ]; then
	echo -e "\n\nSeeding db"
	#npm run seed
fi

echo -e '\n Startup has finished'

