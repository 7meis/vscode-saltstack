#!/usr/bin/env groovy

node {
	stage 'Checkout code'
	deleteDir()
	git url: 'https://github.com/korekontrol/vscode-saltstack.git'

		stage 'Install / Validate'
	sh "npm install"
		sh "npm run validate"

	stage "Package"
	def packageJson = readJSON file: 'package.json'
		sh "npm run package:local -- -o saltstack-${packageJson.version}-${env.BUILD_NUMBER}.vsix"

	stage 'Stash'
	def vsix = findFiles(glob: '**.vsix')
	stash name:'vsix', includes:vsix[0].path
}

node {

	stage "Publish to Marketplace"
	timeout(time:1, unit:'DAYS') {
		input message:'Approve publish to marketplace?', submitter: 'elephant'
	}
	unstash 'vsix';

	// Token can be obtained from: https://korekontrol-de.visualstudio.com/_details/security/tokens
	// Max token validity is 1 year
	withCredentials([[$class: 'StringBinding', credentialsId: 'vscode_marketplace', variable: 'TOKEN']]) {
		def vsix = findFiles(glob: '**.vsix')
			sh 'npx --yes @vscode/vsce publish -p ${TOKEN} --packagePath' + " ${vsix[0].path}"
	}
	archive includes:"**.vsix"
}